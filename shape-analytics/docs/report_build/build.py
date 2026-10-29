import re, sys
ROOT = '/home/srirammohan/Desktop/college/solid-mech-project/shape-analytics/'
cache = {}
def lines(f):
    if f not in cache: cache[f] = open(ROOT + f, encoding='utf-8').read().split('\n')
    return cache[f]
MAP = {'σ':'sigma','τ':'tau','φ':'phi','ε':'eps','θ':'theta','λ':'lambda','ν':'nu','Δ':'D','ρ':'rho','α':'alpha','μ':'mu','π':'pi','ω':'omega','ξ':'xi','η':'eta','ζ':'zeta','γ':'gamma','β':'beta','κ':'kappa','∂':'d','√':'sqrt','²':'^2','³':'^3','⁴':'^4','⁻':'-','·':'*','−':'-','–':'-','—':'--','′':"'",'×':'x','≥':'>=','≤':'<=','≈':'~=','∞':'inf','→':'->','°':'deg','∑':'sum','∫':'int','½':'1/2','⋅':'*','µ':'u','…':'...','≠':'!=','±':'+-','‑':'-','“':'"','”':'"','’':"'",'‘':"'",'Σ':'Sum','ʹ':"'",'₁':'1','₂':'2','₃':'3','∇':'grad','⁰':'0','¹':'1','↔':'<->','✓':'ok','•':'*','▸':'>','≡':'==','∈':'in','Ω':'Omega','Π':'Pi'}
BAD = set()
def ascii_safe(s):
    out = []
    for ch in s:
        if ord(ch) < 128 or ch == '\n': out.append(ch)
        elif ch in MAP: out.append(MAP[ch])
        else: BAD.add(ch); out.append('?')
    return ''.join(out)
def ex(f, anchor, n, cap=None, skip=0):
    L = lines(f)
    for i, l in enumerate(L):
        if anchor in l:
            i += skip; seg = L[i:i + n]
            while seg and not seg[-1].strip(): seg.pop()
            body = ascii_safe('\n'.join(seg))
            cap = cap or f'{f}, lines {i+1}--{i+len(seg)}'
            return ('\\begin{listing}[H]\\captionsetup{font=small}\n\\begin{Verbatim}[fontsize=\\fontsize{6.6}{8}\\selectfont,numbers=left,numbersep=4pt,firstnumber=%d,frame=lines,rulecolor=\\color{gray!60},breaklines,breakanywhere]\n' % (i + 1)
                    + body + '\n\\end{Verbatim}\n\\caption*{\\texttt{' + cap.replace('_', '\\_') + '}}\n\\end{listing}\n')
    sys.exit('anchor not found: %s | %s' % (f, anchor))
import glob
src = ''.join(open(p, encoding='utf-8').read() + '\n' for p in sorted(glob.glob('body*.tex')))
def sub(m):
    parts = [p.strip() for p in m.group(1).split('|')]
    f, anchor, n = parts[0], parts[1], int(parts[2]); cap = parts[3] if len(parts) > 3 and parts[3] else None
    skip = int(parts[4]) if len(parts) > 4 else 0
    return ex(f, anchor, n, cap, skip)
out = re.sub(r'@@CODE ([^@]*)@@', sub, src)
open('project_report.tex', 'w', encoding='utf-8').write(open('preamble.tex', encoding='utf-8').read() + out + '\n\\end{document}\n')
print('built', len(out), 'unmapped:', sorted(BAD))
