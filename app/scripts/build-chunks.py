"""끊어 읽기용 분절 데이터 생성 (jieba, 오프라인 1회).

사용법:  pip install jieba && python scripts/build-chunks.py
출력:    src/data/zh-chunks.json  — 문장마다 "神|爱/世人，…" 형태의 문자열 배열.
         `|` = 단어(词) 경계, `/` = 구(短语) 경계(단어 경계의 부분집합).
         구두점 옆에는 표시를 넣지 않는다. 앱은 표시를 걷어낸 원문으로 조회한다.
레슨 본문(zh)이 바뀌면 다시 실행한다. 데이터에 없는 문장은 앱이 Intl.Segmenter로 폴백한다.
"""
import json, re, sys, warnings
warnings.filterwarnings('ignore')
import jieba, jieba.posseg as P
jieba.setLogLevel(60)

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace(chr(92), '/')
DATA = ROOT + '/src/data'

# 종교 고유어는 한 단어로, 잘못 뭉치는 표현은 분리.
for w in ['耶稣基督','耶稣','基督','上帝','天主','圣灵','圣经','圣父','圣子','天父','天堂','天国','天使','救主','救世主','救赎','救恩','弥赛亚','福音','真理','信仰','罪人','教会','使徒','先知','门徒','加利利','独生子','世人']:
    jieba.add_word(w, 100000)
jieba.del_word('神爱')
jieba.del_word('神爱世人')
jieba.suggest_freq(('神', '爱', '世人'), True)
jieba.suggest_freq(('神', '的'), True)
jieba.add_word('神', 100000, 'n')
for w in ['感觉不到','做不到','看不见','听不见','找不到','得不到','看不到','想不到','来不及','靠不住','客西马尼','祭司长','跟从','同在','听起来','生下来','忧忧愁愁','确据','老是','不一样','大爆炸','管会堂']:
    jieba.add_word(w, 1000000)
for t in [('主','使'),('神','将'),('神','造'),('神','使'),('求','和','耶稣'),('的','确据')]:
    jieba.suggest_freq(t, True)
jieba.del_word('地用'); jieba.add_word('地', 10000000, 'uv')
jieba.add_word('是啊', 100000, 'y')
jieba.add_word('不信', 100000, 'v')
for t in [('这','光','会'),('他','用'),('能','住'),('要','作'),('一','本','书'),('好好','地','用'),('背','不起')]:
    jieba.suggest_freq(t, True)

PREP = set('在 把 被 对 向 从 跟 与 让 使 将 为 为了 关于 对于 按照 通过 随着 因 由 用 给 叫'.split())
CONJ = set('因为 所以 但是 可是 而且 如果 虽然 然后 甚至 因此 并且 或者 不但 而是 如同 若 要是 就是 但 而 和 及 与'.split())
PART = set('了 着 过 吗 呢 吧 啊 啦 嘛 呀 哇'.split())
ADVR = set('这么 那么 怎么 怎样 怎么样 为什么 这样 那样 多么'.split())
DEG = set('很 最 太 非常 特别 十分 更 真 极 挺 多么'.split())
HAN = re.compile(r'[一-鿿0-9A-Za-z]')

def cls(w, f, nxt_f):
    if w == '的' or f in ('uj', 'ude1'): return 'DE'
    if w in PART or (w == '地' and f.startswith('u')): return 'PART'
    if w in PREP and not (f.startswith('v') and len(w) > 1): return 'P'
    if w in ADVR: return 'V'
    if w in CONJ: return 'C'
    if f == 'c': return 'V'
    if f.startswith(('n', 'r', 'm', 'q', 'b', 'f', 's', 't')) or f in ('eng', 'l', 'i'): return 'N'
    if f.startswith('a') and (nxt_f is not None and (nxt_f.startswith(('n', 'r', 'm', 'q', 'b')) or nxt_f in ('uj', 'ude1'))): return 'N'
    if f.startswith(('v', 'd', 'a', 'z', 'u', 'y', 'p')): return 'V'
    return 'N'

def phrases(clause):
    """clause: [(word, flag)] → 구 목록(각 구는 단어 리스트)."""
    n = len(clause)
    fl = [f for _, f in clause]
    cl = [cls(w, f, fl[i + 1] if i + 1 < n else None) for i, (w, f) in enumerate(clause)]
    for i in range(n):
        w = clause[i][0]
        # 的 뒤의 형용사/동사성 단어 = 수식받는 핵심어(명사구의 일부)
        if i > 0 and cl[i - 1] == 'DE' and cl[i] == 'V' and fl[i].startswith(('a', 'v')) and w not in PART:
            cl[i] = 'N'
        # 정도부사 + 형용사 + 的  → 명사구 수식부
        if cl[i] == 'V' and (w in DEG or w in ADVR) and i + 2 < n and cl[i + 2] == 'DE':
            cl[i] = 'N'; cl[i + 1] = 'N'
        # 동사/형용사 + 的 + 명사 (관형절) → 한 명사구
        if cl[i] == 'V' and fl[i].startswith(('a', 'v')) and i + 2 < n and cl[i + 1] == 'DE' and cl[i + 2] == 'N' and w not in PART:
            cl[i] = 'N'
        if w == '同' and i + 1 < n and fl[i + 1].startswith('m'): cl[i] = 'N'
        # 不在乎/不知道 같은 不+X 성어는 술어
        if fl[i] in ('i', 'l') and w.startswith(('不', '没', '别')): cl[i] = 'V'
        # 수사+양사+명사: 一个 很 → 한 덩어리 유지(수사 뒤 정도부사는 명사구 안)
        if i > 0 and cl[i - 1] == 'N' and fl[i - 1].startswith('m') and w in DEG and i + 1 < n and cl[i + 1] in ('N', 'DE'):
            cl[i] = 'N'
    groups, i, pend = [], 0, []
    n = len(clause)
    while i < n:
        c = cl[i]
        if c == 'C' and clause[i][0] in ('和', '及', '或者', '以及') and groups and not pend and cl[i - 1] in ('N', 'DE') and i + 1 < n and cl[i + 1] in ('N', 'DE'):
            groups[-1].append(clause[i][0]); i += 1
            while i < n and cl[i] in ('N', 'DE'): groups[-1].append(clause[i][0]); i += 1
            continue
        if c == 'DE' and groups and not pend and i > 0 and cl[i - 1] == 'V' and (i + 1 >= n or cl[i + 1] not in ('N', 'DE')):
            groups[-1].append(clause[i][0]); i += 1
            continue
        if c == 'C':
            pend.append(clause[i][0]); i += 1; continue
        g = pend; pend = []
        if c == 'P':
            attach = clause[i][0] in ('在', '到') and groups and not g and i > 0 and cl[i - 1] == 'V'
            if attach: g = groups[-1]
            g.append(clause[i][0]); i += 1
            k = len(g)
            while i < n and cl[i] in ('N', 'DE'): g.append(clause[i][0]); i += 1
            if len(g) == k or g[0] in ('把', '将'):
                while i < n and cl[i] in ('V', 'PART'): g.append(clause[i][0]); i += 1
                if g[0] in ('把', '将') and i < n and cl[i] == 'N' and clause[i][1].startswith('r') and len(clause[i][0]) == 1:
                    g.append(clause[i][0]); i += 1
        elif c in ('N', 'DE'):
            st = i
            while i < n and cl[i] in ('N', 'DE'): g.append(clause[i][0]); i += 1
            if i >= n and len(g) == 2 and g[1] == '的' and not pend and groups and st > 0 and cl[st - 1] == 'V':
                groups[-1].extend(g); continue
        elif c == 'PART':
            if groups and not g: groups[-1].append(clause[i][0])
            else: g.append(clause[i][0])
            i += 1
            if not g: continue
        else:  # V
            while i < n and cl[i] in ('V', 'PART'): g.append(clause[i][0]); i += 1
        if g and not (g is groups[-1] if groups else False): groups.append(g)
    # 동사 + 절 끝의 1글자 대명사 목적어(认识你, 传给你)는 한 덩어리
    if len(groups) >= 2 and len(groups[-1]) == 1 and groups[-1][0] in '你我他她它' and cl[-1] == 'N' and cl[-2] != 'P':
        if cl[n - 2] in ('V', 'PART') or clause[n - 2][1].startswith('v'):
            groups[-2].extend(groups.pop())
    if pend:
        if groups: groups[-1].extend(pend)
        else: groups.append(pend)
    return groups

SPLIT = {'地用': [('地', 'uv'), ('用', 'p')], '主使': [('主', 'n'), ('使', 'p')], '神将': [('神', 'n'), ('将', 'p')], '神造': [('神', 'n'), ('造', 'v')], '神使': [('神', 'n'), ('使', 'p')]}

def mark(text):
    toks = []
    for w in P.cut(text):
        if w.word == '只' and toks and toks[-1][1] == 'm': toks.append(('只', 'q'))
        elif w.word in SPLIT: toks += SPLIT[w.word]  # jieba가 못 가르는 어휘 보정
        else: toks.append((w.word, w.flag))
    # 구두점 토큰으로 절을 나눈다
    out, clause = [], []
    def flush():
        nonlocal clause
        if clause:
            gs = phrases(clause)
            out.append('/'.join('|'.join(g) for g in gs))
            clause = []
    for w, f in toks:
        if HAN.search(w): clause.append((w, f))
        else:
            flush(); out.append(w)
    flush()
    s = ''.join(out)
    assert re.sub(r'[|/]', '', s) == text.replace('/', '').replace('|', '') or '/' in text or '|' in text, text
    return s

def collect(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'zh' and isinstance(v, str): acc.add(v)
            else: collect(v, acc)
    elif isinstance(o, list):
        for v in o: collect(v, acc)

acc = set()
for f in ['lessons-vol1', 'lessons-vol2', 'lessons-vol3', 'appendices']:
    collect(json.load(open(f'{DATA}/{f}.json', encoding='utf8')), acc)
texts = sorted(t for t in acc if HAN.search(t) and '/' not in t and '|' not in t)
res = [mark(t) for t in texts]
json.dump(res, open(f'{DATA}/zh-chunks.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(res), 'sentences')
for t in res[:0]: print(t)
if len(sys.argv) > 1:
    import random; random.seed(1)
    for s in random.sample(res, 25): print(s)
