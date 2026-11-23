"""检查自我介绍视频的生成笔记本和分镜数据（不需要显卡）：python3 scripts/intro-video/check_notebook.py

1. shin-intro-h3.ipynb 每格代码都能编译；
2. 替换提示词、种子、时长的 patch_workflow 和找输出文件的 output_files 行为正确；
3. shots.json：时长 4–15 秒整数，提示词六段齐全，用到的 <Picture N> / <Audio N> 不超过该组实际放的参考数量，
   每句台词都原样写在提示词的 <d>[Chinese] …</d> 里。
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
helpers = next(src for src in codes if "def patch_workflow" in src)
display_stub = types.ModuleType("IPython.display")
display_stub.Video = display_stub.display = lambda *a, **k: None
sys.modules.setdefault("IPython", types.ModuleType("IPython"))
sys.modules["IPython.display"] = display_stub
ns = {}
exec("import json, os, shutil, subprocess, sys, time, pathlib, zlib, urllib.request", ns)
exec(compile(helpers, "helpers", "exec"), ns)

wf = {
    "1": {"class_type": "TextEncode", "inputs": {"text": "{{PROMPT}}"}},
    "2": {"class_type": "Sampler", "inputs": {"seed": 1, "steps": 4, "cfg": 1.0}},
    "3": {"class_type": "Latent", "inputs": {"duration": 5, "width": 1344}},
    "4": {"class_type": "Noise", "inputs": {"noise_seed": 3, "enable": True, "seed": True}},
}
patched, hits = ns["patch_workflow"](wf, "镜头提示词", 42, 12)
assert patched["1"]["inputs"]["text"] == "镜头提示词"
assert patched["2"]["inputs"]["seed"] == 42 and patched["4"]["inputs"]["noise_seed"] == 42
assert patched["4"]["inputs"]["seed"] is True, "布尔值不能被当成种子改掉"
assert patched["3"]["inputs"]["duration"] == 12 and patched["3"]["inputs"]["width"] == 1344
assert hits == {"prompt": 1, "seed": 2, "duration": 1}, hits
assert wf["1"]["inputs"]["text"] == "{{PROMPT}}", "原工作流不能被改"
try:
    ns["patch_workflow"]({"1": {"inputs": {"text": "hello"}}}, "x", 1, 5)
    raise AssertionError("没有 {{PROMPT}} 时应该报错")
except ValueError:
    pass
entry = {"outputs": {"9": {"gifs": [{"filename": "a.mp4", "subfolder": "", "type": "output"}]},
                     "10": {"images": [{"filename": "preview.png", "type": "temp"}]},
                     "11": {"videos": [{"filename": "b.mp4", "subfolder": "x", "type": "output"}]}}}
assert [f["filename"] for f in ns["output_files"](entry)] == ["a.mp4", "b.mp4"]
assert ns["seed_for"]("card", 1) == ns["seed_for"]("card", 1) != ns["seed_for"]("card", 2)

data = json.loads((HERE / "shots.json").read_text())
groups = data["groups"]
for shot in data["shots"]:
    sid, prompt = shot["id"], shot["prompt"]
    assert shot["group"] in groups, sid
    assert isinstance(shot["seconds"], int) and 4 <= shot["seconds"] <= 15, sid
    for section in ("subject_definitions:", "summary:", "retention_analysis:", "detailed_description:", "overall_soundscape:", "non_diegetic_music:"):
        assert section in prompt, f"{sid} 缺 {section}"
    group = groups[shot["group"]]
    pics = [int(n) for n in re.findall(r"<Picture (\d+)>", prompt)]
    auds = [int(n) for n in re.findall(r"<Audio (\d+)>", prompt)]
    assert max(pics, default=0) <= len(group["images"]), f"{sid} 用了 <Picture {max(pics)}>，组里只有 {len(group['images'])} 张"
    assert max(auds, default=0) <= len(group["audio"]), f"{sid} 用了 <Audio {max(auds, default=0)}>，组里只有 {len(group['audio'])} 段"
    spoken = re.findall(r"<d>\[Chinese\] (.*?)</d>", prompt)
    for line in shot["lines"]:
        assert line["text"] in spoken, f"{sid} 的台词没写进提示词：{line['text']}"
    assert len(spoken) == len(shot["lines"]), f"{sid} 提示词里的台词和 lines 数量不一样"
total = sum(s["seconds"] for s in data["shots"])
print(f"ok: {len(codes)} 格代码可编译，工具函数通过，{len(data['shots'])} 个镜头共 {total} 秒，参考编号和台词一致")
