"""SW caching is suspended. Run legacy-to-retirement lifecycle acceptance tests."""
import pathlib,runpy
runpy.run_path(str(pathlib.Path(__file__).with_name('connection-browser.py')),run_name='__main__')
