# 部署與維運

本文件從舊版 README 移過來，內容是發版、正式主機部署、服務安裝與上線檢查。專案介紹見 [README](../README.md)。

## 設定與部署

正式網址為 `https://connect4.oraclelee.com`。正式主機需要 Podman 3.4+、
systemd user service、Nginx 與有效的 TLS 憑證；開發機不需要安裝以下服務。

### 發版與取得映像

版本規則：小修改把最後一位 +1（3.0.0 → 3.0.1），大改把中間那位 +1（3.0.0 → 3.1.0）。
不要手改版本號，在開發機任何一個 checkout 執行：

```bash
scripts/release.sh patch     # 或 minor；加 --dry-run 只做檢查
```

腳本在一個暫時的 worktree 裡改 `pyproject.toml` 與 `frontend/package.json`、確認舊版本號
沒有殘留在建置或部署檔案裡，開一個「Release X.Y.Z」的 pull request 並設定綠燈自動合併；
合併後把 `vX.Y.Z` tag 打在合併出來的 main commit 上。CI 的 `backend` 與 `frontend` 兩個 job
平行跑完整測試（含 e2e），都綠之後 `container` job 會確認 tag 與兩個 manifest 的版本一致，
建立 GitHub Release，再把映像發布到
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
CONNECT4_APP_ORIGINS=capacitor://localhost,https://localhost
```

`CONNECT4_APP_ORIGINS` 是手機 app 頁面的來源（iOS `capacitor://localhost`、Android
`https://localhost`）。只有這些來源能跨網域讀取 `/api/session`，並用 session token 連線，詳見
`docs/protocol.md` 的「App 連線」。沒設定時預設就是這兩個；設成空字串就關閉 app 模式。

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

只有原生精確求解器自測通過，`GET /api/health` 才回傳 HTTP 200；回應裡的 `version`
是上線的應用程式版本，部署後用它確認換版成功（`deploy.sh` 結尾也會印出）。更新版本的順序是：
開發機 `scripts/release.sh patch|minor` → 等 GitHub Actions 全綠 → 正式主機
`deploy/deploy.sh vX.Y.Z`（或從原始碼重建相同 production tag 再
`systemctl --user restart connect4.service`）。程序重啟會清除進行中的房間與配對。

### iOS Universal Links（apple-app-site-association）

有裝 iOS app 的手機點邀請連結（`/r/房號`，舊的 `/?room=房號` 也算）時，會直接打開 app。
iOS 靠網站上的 `/.well-known/apple-app-site-association` 判斷要不要交給 app：內容在
`backend/connect4_app/well_known.py`，由 FastAPI 直接回傳。Apple 規定這個網址必須是 HTTPS、
憑證有效、不能轉址，內容是 `application/json`；CI 的 pytest 與容器冒煙測試都會檢查。

上線後在開發機檢查（GitHub runner 與 Python 的 urllib 都會被 Cloudflare 擋，要用開發機的 curl）：

```bash
curl -sS -o /dev/null -D - https://connect4.oraclelee.com/.well-known/apple-app-site-association \
    | grep -iE '^(HTTP|content-type|location)'
# 應該是 200、content-type: application/json，而且沒有 location

curl -sS -D - https://app-site-association.cdn-apple.com/a/v1/connect4.oraclelee.com
# 手機讀的是 Apple 的 CDN 這一份，不是正式站。Apple 會在 24 小時內重新抓取，
# 結果從 404（SWCERR00401 這類原因）變成 200，內容和正式站相同
```

- 網站要比帶 Associated Domains 的新版 app 先上線，Apple 的 CDN 才來得及抓到。
- 已安裝 app 的手機大約每週才更新一次這個檔案；改 Team ID 或網址規則時，改 `well_known.py` 再發版。
- 正式站回應正確、Apple 的 CDN 卻一直抓不到時，可能是 Cloudflare 擋了 Apple 的抓取程式；
  要調整 Cloudflare 前，先問使用者。
