import assert from 'node:assert/strict';
import { notificationSettings } from '../apps/web/lib/notification-copy.ts';
import { realtimeActions } from '../apps/web/lib/realtime.ts';

// 实时推送：Core 的消息 → 前台要做的事（apps/web/lib/realtime.ts，components/notifications.tsx 执行）。
// 用法：node scripts/verify-notifications.mjs（pnpm verify）
const id = '0123456789abcdef01234567';
const other = 'fedcba9876543210fedcba98';
const home = { path: '/', article: null };
const reading = (kind) => ({ path: '/x', article: { kind, id } });
const run = (type, data, context = home) => realtimeActions({ type, data }, context);

// 在线人数
assert.deepEqual(run('VISITOR_ONLINE', { online: 3 }), [{ type: 'online', count: 3 }]);
assert.deepEqual(run('VISITOR_OFFLINE', { online: 2, sessionId: 'x' }), [{ type: 'online', count: 2 }]);
assert.deepEqual(run('VISITOR_ONLINE', {}), []);

// 新文章：只播已发布的，带“去看看”
assert.deepEqual(run('POST_CREATE', { id, title: '月亮', slug: 'moon', category: { slug: '技术' }, isPublished: true }), [
  { type: 'announce', copy: 'POST_CREATE', icon: 'post', title: '月亮', titleId: id, href: `/posts/${encodeURIComponent('技术')}/moon` },
]);
for (const data of [null, {}, { isPublished: false }, { isPublished: 'true' }]) assert.deepEqual(run('POST_CREATE', data), [], '未发布的文章不播');
// 新手记、新思考、新一言
assert.deepEqual(run('NOTE_CREATE', { id, nid: 12, title: '夜里' }), [{ type: 'announce', copy: 'NOTE_CREATE', icon: 'note', title: '夜里', titleId: id, href: '/notes/12' }]);
assert.deepEqual(run('NOTE_CREATE', { id, nid: 12, title: '草稿', isPublished: false }), []);
assert.deepEqual(run('RECENTLY_CREATE', { id, content: '  今天\n读到一句话 ' }), [{ type: 'announce', copy: 'RECENTLY_CREATE', icon: 'thinking', text: '今天 读到一句话', href: '/thinking' }]);
assert.equal(run('SAY_CREATE', { id, text: '星'.repeat(60) })[0].text, `${'星'.repeat(40)}…`, '一言正文只取开头');
// 就在那份列表上：不给“去看看”，改为刷新列表
assert.deepEqual(run('SAY_CREATE', { id, text: '月色真美' }, { path: '/says', article: null }), [
  { type: 'announce', copy: 'SAY_CREATE', icon: 'say', text: '月色真美' },
  { type: 'refresh-list', list: 'says' },
]);
assert.deepEqual(run('RECENTLY_CREATE', { id, content: 'x' }, { path: '/thinking', article: null })[1], { type: 'refresh-list', list: 'recently' });

// 修改：只对正在看的那篇，播报并刷新
for (const kind of ['post', 'note', 'page']) {
  const type = `${kind.toUpperCase()}_UPDATE`;
  assert.deepEqual(run(type, { id, title: 't' }, reading(kind)), [{ type: 'announce', copy: type, icon: 'update' }, { type: 'refresh-article', kind, id }]);
  assert.deepEqual(run(type, { id: other }, reading(kind)), [], '别的那篇改了不管');
  assert.deepEqual(run(type, { id }, home), [], '不在详情页不管');
}
assert.deepEqual(run('NOTE_UPDATE', { id }, reading('post')), [], '类型不对不管');
// 译文更新：正在看的那篇换上新译文
assert.deepEqual(run('TRANSLATION_UPDATE', { refId: id, refType: 'note', lang: 'en' }, reading('note')), [{ type: 'refresh-article', kind: 'note', id }]);
assert.deepEqual(run('TRANSLATION_CREATE', { refId: other }, reading('note')), []);

// 删除：载荷是 id 字符串；播报并跳回列表
assert.deepEqual(run('POST_DELETE', id, reading('post')), [{ type: 'announce', copy: 'POST_DELETE', icon: 'remove' }, { type: 'leave', id, href: '/posts' }]);
assert.deepEqual(run('NOTE_DELETE', id, reading('note'))[1], { type: 'leave', id, href: '/notes' });
assert.deepEqual(run('PAGE_DELETE', id, reading('page'))[1], { type: 'leave', id, href: '/' });
assert.deepEqual(run('POST_DELETE', other, reading('post')), []);
assert.deepEqual(run('POST_DELETE', { id }, reading('post')), [], '载荷不是字符串不认');

// 阅读数：只更新正在看的那篇
assert.deepEqual(run('ARTICLE_READ_COUNT_UPDATE', { id, count: 8, type: 'post' }, reading('post')), [{ type: 'reads', id, count: 8 }]);
assert.deepEqual(run('ARTICLE_READ_COUNT_UPDATE', { id: other, count: 8 }, reading('post')), []);

// 其他消息、坏消息都不做事
for (const message of [null, 'POST_CREATE', {}, { type: 'health_check' }, { type: 'AUTH_FAILED' }, { type: 'COMMENT_CREATE', data: {} }, { type: 'fn#ps-update', data: {} }]) {
  assert.deepEqual(realtimeActions(message, reading('post')), []);
}
assert.equal(notificationSettings.timeout, 5000);
console.log('PASS realtime actions: online, new post/note/thinking/say, update and delete of the article being read, translations, read counts');
