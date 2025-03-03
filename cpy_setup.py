from setuptools import setup
from Cython.Build import cythonize
import numpy

setup(
    ext_modules=cythonize(
        "mcts_table_build.pyx",
        compiler_directives={"language_level": "3", "boundscheck": False, "wraparound": False}  # 讓 Cython 更快
    ),
    include_dirs=[numpy.get_include()]  # 確保 NumPy 的 C 頭文件可用
)


