# Connect 4

一個伺服器權威的即時四子棋：支援 Super AI（精確求解器）、私人房與隨機配對，介面提供繁體中文／英文，並針對現代 iPhone 與 Samsung Galaxy 版面驗證。

## 技術架構

- `backend/connect4_app/`：FastAPI、原生 WebSocket、匿名 Cookie 工作階段與房間狀態。
- `native_solver/`：PyO3 擴充，封裝 `connect-four-ai` 1.0.0 精確求解器。
- `frontend/`：Vue 3、TypeScript、Pinia、Vue I18n 與響應式棋盤；介面規格見 `design/spec.md`。
- `Containerfile`、`deploy/`：Podman 正式映像、環境設定範例與 systemd user service。

AI 會算出每個合法落子的精確終局分數，再選擇最高分手；同分時固定採中央優先。沒有深度限制、隨機弱化或啟發式備援。原生引擎若故障，該局會停止並回報錯誤。

## 本機開發

需要 Python 3.10+、stable Rust、Node.js 22+：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
npm --prefix frontend install
```

分別啟動 API 與 Vite：

```bash
.venv/bin/uvicorn connect4_app.app:app --host 127.0.0.1 --port 55555 --reload
npm --prefix frontend run dev
```

開啟 `http://127.0.0.1:5173`。正式執行時先跑 `npm --prefix frontend run build`，再以單一 Uvicorn worker 啟動；房間狀態目前存於記憶體，不可使用多 worker。

## 驗證

```bash
.venv/bin/pytest
.venv/bin/ruff check backend tests
npm --prefix frontend test
npm --prefix frontend run build
```

手機矩陣測試涵蓋 390×844 至 440×956 的 iPhone 14 Pro Max～17 系列，以及 Galaxy S26 Ultra 直向／橫向：

```bash
cd frontend
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

測試會檢查水平溢位、44px 觸控目標、鍵盤高度與視覺基準。

## 設定與部署

正式網址為 `https://connect4.oraclelee.com`。正式主機需要 Podman 3.4+、
systemd user service、Nginx 與有效的 TLS 憑證；開發機不需要安裝以下服務。

### 發版與取得映像

版本規則：小修改把最後一位 +1（3.0.0 → 3.0.1），大改把中間那位 +1（3.0.0 → 3.1.0）。
不要手改版本號，在開發機的 `main` 上執行：

```bash
scripts/release.sh patch     # 或 minor；加 --dry-run 只做檢查
```

腳本會改 `pyproject.toml` 與 `frontend/package.json`、確認舊版本號沒有殘留在建置或
部署檔案裡、跑 ruff／pytest／vitest／前端 build，然後 commit「Release X.Y.Z」、打
`vX.Y.Z` tag 並 push。CI 的 `backend` 與 `frontend` 兩個 job 平行跑完整測試（含 e2e），
都綠之後 `container` job 會確認 tag 與兩個 manifest 的版本一致，再把映像發布到
`ghcr.io/edwardleeee/connect4-web:<tag>`（同時更新 `latest`）。GHCR 套件為
Private，正式主機要先用一個只有 `read:packages` 權限的 GitHub personal access
token（classic）登入一次：

```bash
podman login ghcr.io --username <GitHub 帳號> --authfile ~/.config/containers/auth.json
```

一定要指定 `--authfile`：不指定時 podman 把憑證存在
`$XDG_RUNTIME_DIR/containers/auth.json`，那個目錄在 tmpfs，主機重開機就會被清掉，
下次 `podman pull` 會失敗；存在 `~/.config/containers/auth.json` 才會保留。

每個映像都帶 `org.opencontainers.image.revision` label（建置時的 commit SHA），
部署前可以確認拉到的映像對應哪個 commit，不必猜 tag 是否被移動過：

```bash
podman image inspect --format '{{ index .Labels "org.opencontainers.image.revision" }}' ghcr.io/edwardleeee/connect4-web:v3.0.0
```

之後正式主機不必安裝 Rust 或 Node，直接拉映像部署：

```bash
deploy/deploy.sh v3.0.0
```

腳本會 `podman pull` 該 tag、把它標成 `localhost/connect4-web:production`、重啟
服務並等待 `/api/health` 回 200；60 秒內不健康就自動切回上一版映像
（`localhost/connect4-web:previous`）。回滾同一支腳本帶舊 tag 即可。

沒有網路或要驗證未發布的變更時，仍可在主機上從原始碼建置：

```bash
git pull --ff-only origin main
podman build --format docker --file Containerfile --tag localhost/connect4-web:production .
```

映像會分階段建置 Vue、Rust/PyO3 與 Python 套件；最終容器以非 root
帳號執行單一 Uvicorn worker。不要在正式環境加入 `--reload` 或增加
worker，因為房間與配對狀態目前存於單一程序記憶體。正式主機目前是 Podman 4.9.3；
不論版本都要用 Docker image format（`--format docker`），才能保留映像內的
`HEALTHCHECK`。

### 安裝 rootless 背景服務

```bash
install -d -m 700 ~/.config/connect4 ~/.config/systemd/user
install -m 600 deploy/connect4.env.example ~/.config/connect4/connect4.env
install -m 644 deploy/connect4.service ~/.config/systemd/user/connect4.service
sudo loginctl enable-linger "$(id -un)"
systemctl --user daemon-reload
systemctl --user enable --now connect4.service
```

`connect4.env` 的正式預設值為：

```bash
CONNECT4_COOKIE_SECURE=1
CONNECT4_ALLOWED_ORIGINS=https://connect4.oraclelee.com
```

服務只發布到 `127.0.0.1:55555`，由 Nginx 對外提供 HTTPS 與 WebSocket。
反向代理範例位於 `connect4.conf`；確認憑證路徑後安裝並重新載入：

```bash
sudo install -m 644 connect4.conf /etc/nginx/sites-available/connect4.conf
sudo ln -s /etc/nginx/sites-available/connect4.conf /etc/nginx/sites-enabled/connect4.conf
sudo nginx -t
sudo systemctl reload nginx
```

若啟用連結已存在，保留現有連結即可。正式切換前依序檢查：

```bash
systemctl --user status connect4.service
curl --fail http://127.0.0.1:55555/api/health
curl --fail https://connect4.oraclelee.com/api/health
journalctl --user-unit connect4.service --follow
```

只有原生精確求解器自測通過，`GET /api/health` 才回傳 HTTP 200。更新版本的順序是：
開發機 `scripts/release.sh patch|minor` → 等 GitHub Actions 全綠 → 正式主機
`deploy/deploy.sh vX.Y.Z`（或從原始碼重建相同 production tag 再
`systemctl --user restart connect4.service`）。程序重啟會清除進行中的房間與配對。
