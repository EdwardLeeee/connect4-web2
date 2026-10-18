"""Files the website serves under /.well-known/ for other platforms to read.

They are Python constants rather than data files so that they always ship inside the
package the Containerfile builds. app.py serves each as JSON: the game site's before the
SPA fallback, and APP_LINK_HOST's from the middleware that answers that host.
"""

from __future__ import annotations

from typing import Any

# The iOS app's App ID: Apple Team ID, then the bundle ID (mobile/ios). It is public:
# Apple publishes it in this file for anyone to read.
IOS_APP_ID = "J89WNJYJ63.com.oraclelee.connect4"

# The host the website's "open in the app" banner links to. Safari keeps a universal link to
# the page's own domain in the browser, so the banner needs another host (Apple TN3155, "Use
# universal links on your site"): iOS opens the app when it is installed, and otherwise this
# host sends people to the App Store. Shipped apps name it in their Associated Domains
# entitlement, so it can never be renamed.
APP_LINK_HOST = "connect4-app.oraclelee.com"
APP_STORE_URL = "https://apps.apple.com/app/id6816204087"


def _applinks(*components: dict[str, Any]) -> dict[str, Any]:
    return {"applinks": {"details": [{"appIDs": [IOS_APP_ID], "components": list(components)}]}}


# Universal Links: invite links open the iOS app when it is installed, and the website
# otherwise. Apple's CDN fetches this file for the app's Associated Domains entitlement
# (https://developer.apple.com/documentation/xcode/supporting-associated-domains), so it
# must stay at this exact path, as application/json, with no redirect.
APPLE_APP_SITE_ASSOCIATION = _applinks(
    {
        "/": "/r/??????",
        "comment": "An invite link: /r/ and a six-character room code.",
    },
    {
        "/": "/",
        "?": {"room": "??????"},
        "comment": "An older invite link: /?room= and a six-character code.",
    },
)

# APP_LINK_HOST's own file: each host the entitlement names needs its own (TN3155).
APP_LINK_SITE_ASSOCIATION = _applinks(
    {
        "/": "/r/??????",
        "comment": "The banner on an invite: /r/ and a six-character room code.",
    },
    {
        "/": "/open",
        "comment": "The banner on any other page: opens the app's home screen.",
    },
)
