"""從 src/ 組出單一 HTML。

    python3 build.py                 # 產出 index.html(GitHub Pages 用)
    python3 build.py fragment.html   # 另外產出不含 <html>/<head> 骨架的片段(claude.ai 會自己包)

規則在 src/rules.js(有測試),畫面在 src/app.js。改完先跑測試:
    /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc src/rules.js test/rules.test.js
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def src(name):
    return io.open(os.path.join(HERE, "src", name), encoding="utf-8").read()


css, shell, rules, app = src("style.css"), src("shell.html"), src("rules.js"), src("app.js")
title = "<title>課約 網頁示範</title>\n"
font = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Noto+Sans+TC:wght@400;500;700&family=Quicksand:wght@500;600;700&display=swap">\n')
style = "<style>\n" + css + "</style>\n"
body = shell + '\n<script>\n' + rules + "\n" + app + "\n</script>\n"

index = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
         '<meta name="description" content="課約:單人家教的堂數帳本。下課一鍵扣堂、家長立刻收到剩餘堂數、'
         '月底對帳零爭議。示範版,全是假資料。">\n'
         '<style>html,body{margin:0}:root{padding-top:env(safe-area-inset-top,0px);'
         'padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}</style>\n'
         + title + font + style + "</head>\n<body>\n" + body + "</body>\n</html>\n")
io.open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(index)
print("index.html", len(index.encode("utf-8")), "bytes")

if len(sys.argv) > 1:
    fragment = title + '<meta name="claude:viewport-fit-sides" content="cover">\n' + font + style + body
    io.open(sys.argv[1], "w", encoding="utf-8").write(fragment)
    print(sys.argv[1], len(fragment.encode("utf-8")), "bytes")
