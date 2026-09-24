"""Connect Four application package."""

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _dist_version

try:
    __version__ = _dist_version("connect4-web")
except PackageNotFoundError:  # running from a bare checkout
    __version__ = "0.0.0"
