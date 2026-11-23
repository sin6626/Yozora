"""检查自我介绍视频的生成笔记本和分镜数据（不需要显卡）：python3 scripts/intro-video/check_notebook.py

1. shin-intro-h3.ipynb 每格代码都能编译；
2. 用笔记本里真正的 compose_prompt / build_graph 拼出每个片段的提示词和 ComfyUI 工作流：
   六段齐全，<Picture N> / <Audio N> 不超过该组实际接上的参考数，用到的 <Subject N> 都有定义，
   台词按顺序原样写在 <d>[Chinese] …</d> 里（一个 <d> 里可以连着说几句），工作流的连线都指向存在的节点；
3. 分阶段的依赖对得上：某段要用的 book-sin.png 这类“中途截出来”的参考，必须在更早的阶段截好；
4. 时长 4–15 秒整数，台词语速不超过每秒 5 个字（放得下）。
"""
import json
import pathlib
import re
import sys
import types

HERE = pathlib.Path(__file__).parent
nb = json.loads((HERE / "shin-intro-h3.ipynb").read_text())
assert nb["nbformat"] == 4, "nbformat"
codes = ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]
for i, src in enumerate(codes):
    compile(src, f"cell-{i}", "exec")

# 只执行定义工具函数的那一格，IPython 用替身
tools = next(src for src in codes if "def build_graph" in src)
display_stub = types.ModuleType("IPython.display")
for name in ("Video", "Image", "Audio", "display", "HTML"):
    setattr(display_stub, name, lambda *a, **k: None)
sys.modules.setdefault("IPython", types.ModuleType("IPython"))
sys.modules["IPython.display"] = display_stub
ns = {}
exec("import json, os, shutil, subprocess, sys, time, pathlib, zlib, urllib.request", ns)
exec(compile(tools, "tools", "exec"), ns)
compose, build, align = ns["compose_prompt"], ns["build_graph"], ns["align_frames"]

assert [align(s) for s in (4, 5, 12, 15)] == [107, 124, 294, 362], "帧数要落在 17k+5 上"
assert ns["seed_for"]("p0a", 1) == ns["seed_for"]("p0a", 1) != ns["seed_for"]("p0a", 2)
entry = {"outputs": {"9": {"videos": [{"filename": "a.mp4", "subfolder": "shin", "type": "output"}]},
                     "10": {"images": [{"filename": "preview.png", "type": "temp"}]}}}
assert [f["filename"] for f in ns["output_files"](entry)] == ["a.mp4"]

data = json.loads((HERE / "shots.json").read_text())
groups, shots, cuts = data["groups"], data["shots"], data["cuts"]
models = {"dit": "d", "text_encoder": "t", "video_vae": "v", "audio_vae": "a", "turbo_lora": "l"}
made_in = {c["file"]: c["after_phase"] for c in cuts}
ids = [s["id"] for s in shots]
assert len(ids) == len(set(ids)), "片段 id 重复"
for c in cuts:
    src = next(s for s in shots if s["id"] == c["from"])
    assert src["phase"] == c["after_phase"], f"{c['file']} 要从第 {c['after_phase']} 阶段的片段里截，{c['from']} 在第 {src['phase']} 阶段"

for shot in shots:
    sid, group = shot["id"], groups[shot["group"]]
    assert isinstance(shot["seconds"], int) and 4 <= shot["seconds"] <= 15, sid
    for f in group["images"] + group["audio"]:
        if f in made_in:
            assert made_in[f] < shot["phase"], f"{sid} 在第 {shot['phase']} 阶段，要用的 {f} 第 {made_in[f]} 阶段之后才截"
    prompt = compose(shot, data)
    for section in ("subject_definitions:", "summary:", "retention_analysis:", "detailed_description:", "overall_soundscape:", "non_diegetic_music:"):
        assert section in prompt, f"{sid} 缺 {section}"
    pics = [int(n) for n in re.findall(r"<Picture (\d+)>", prompt)]
    auds = [int(n) for n in re.findall(r"<Audio (\d+)>", prompt)]
    assert max(pics, default=0) <= len(group["images"]), f"{sid} 用了 <Picture {max(pics)}>，组里只有 {len(group['images'])} 张"
    assert max(auds, default=0) <= len(group["audio"]), f"{sid} 用了 <Audio {max(auds, default=0)}>，组里只有 {len(group['audio'])} 段"
    defined = {s["text"].split(" is ", 1)[0] for s in group["subjects"]}
    used = set(re.findall(r"<Subject \d+>", shot["summary"] + shot["shots"]))
    assert used <= defined, f"{sid} 用了没定义的 {used - defined}"
    for tag in used:
        assert re.search(re.escape(tag) + r" \(appears in ", prompt), f"{sid} 的保留说明里没有 {tag}"
    spoken = re.findall(r"<d>\[Chinese\] (.*?)</d>", prompt)
    assert "".join(spoken) == "".join(l["text"] for l in shot["lines"]), f"{sid} 提示词里的台词和 lines 不一致：{spoken}"
    chars = sum(len(re.findall(r"[一-鿿]", t)) + len(re.findall(r"[A-Za-z]+", t)) for t in spoken)
    assert chars / shot["seconds"] <= 5.0, f"{sid} 台词太多：{chars} 字 / {shot['seconds']} 秒"

    for turbo in (True, False):
        graph = build(shot, data, 42, turbo, models)
        cond = graph["cond"]["inputs"]
        assert sum(k.startswith("ref_images.") for k in cond) == len(group["images"]), sid
        assert sum(k.startswith("ref_audios.") for k in cond) == len(group["audio"]), sid
        assert cond["length"] == align(shot["seconds"])
        assert ("lora" in graph) == turbo and graph["sigmas"]["inputs"]["steps"] == (4 if turbo else 20)
        for node in graph.values():
            for value in node["inputs"].values():
                if isinstance(value, list):
                    assert value[0] in graph, f"{sid} 的工作流连到了不存在的节点 {value[0]}"

phases = sorted({s["phase"] for s in shots})
total = sum(s["seconds"] for s in shots)
print(f"ok: {len(codes)} 格代码可编译；{len(shots)} 个片段共 {total} 秒，分 {len(phases)} 个阶段；提示词、参考编号、台词、工作流、阶段依赖都对得上")
