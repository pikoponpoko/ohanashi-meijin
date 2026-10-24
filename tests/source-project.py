"""Compatibility entrypoint: private-source acceptance moved into the current feedback suite.
The older metadata-only/keep-legacy-label assertions were superseded by the 2026-10-24 instructions.
"""
import pathlib,runpy
runpy.run_path(str(pathlib.Path(__file__).with_name('feedback.py')),run_name='__main__')
