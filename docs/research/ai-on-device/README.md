# 重現步驟

這些是 `docs/research/2026-09-ai-on-device.md` 用的量測工具，不是產品程式。

```bash
cd docs/research/ai-on-device

# WASM 套件（不進 repo）
curl -sLo pkg.tgz "$(npm view connect-four-ai-wasm@1.0.0 dist.tarball)" && tar xzf pkg.tgz

# 原生工具（和伺服器同一版引擎）
(cd native-bench && cargo build --release)

# 語料：需要已安裝後端的 .venv（用伺服器引擎當 AI）
../../../.venv/bin/python make_corpus.py corpus.txt games.txt

# 原生冷／暖計時；WASM 在 Node 上計時並比對
./native-bench/target/release/native-bench cold < corpus.txt > native-cold.tsv
./native-bench/target/release/native-bench warm < games.txt > native-warm.tsv
node bench-node.mjs cold corpus.txt > wasm-node-cold.tsv

# 瀏覽器（Playwright 用 frontend/ 的安裝）：引擎、降速倍數、冷／暖、語料檔
python3 -m http.server 8791 --bind 127.0.0.1 &
node bench-browser.mjs chromium 4 cold corpus.txt > chromium4.tsv
node bench-browser.mjs webkit 1 cold corpus.txt > webkit1.tsv

# 開局表局面數、回應表、回應表驗證
./native-bench/target/release/count_positions 12
./native-bench/target/release/reply_table2 13 reply-table.txt
./native-bench/target/release/check_table reply-table.txt < native-cold.tsv
```

輸出每一行是：`對局代號 ⇥ 落子序列 ⇥ 毫秒 ⇥ 選的欄（0 起算） ⇥ 七欄分數`。
