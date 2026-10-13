"""Optional local CPU table recognizer. No remote inference or runtime downloads."""
import json, os, pathlib, sys
root = pathlib.Path(os.environ['PDF_STRUCTURE_HOME']) if os.environ.get('PDF_STRUCTURE_HOME') else pathlib.Path(__file__).resolve().parents[1] / '.local-tools' / 'pdf-structure'
os.environ['PADDLE_PDX_CACHE_HOME'] = str(root / 'cache')
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_DATASETS_OFFLINE'] = '1'
os.environ['PADDLE_PDX_MODEL_SOURCE'] = 'BOS'
from paddleocr import TableRecognitionPipelineV2
models = root / 'models'
def model(name):
    result = models / name
    if not (result / 'inference.yml').is_file(): raise RuntimeError('Local table model missing')
    return str(result)
kwargs = {}
for prefix, name in [('layout_detection', 'PicoDet_layout_1x_table'), ('table_classification', 'PP-LCNet_x1_0_table_cls'),
                     ('wired_table_structure_recognition', 'SLANet_plus'), ('wireless_table_structure_recognition', 'SLANet_plus'),
                     ('wired_table_cells_detection', 'RT-DETR-L_wired_table_cell_det'), ('wireless_table_cells_detection', 'RT-DETR-L_wireless_table_cell_det'),
                     ('text_detection', 'PP-OCRv5_mobile_det'), ('text_recognition', 'PP-OCRv5_mobile_rec')]:
    kwargs[prefix + '_model_name'] = name
    kwargs[prefix + '_model_dir'] = model(name)
pipeline = TableRecognitionPipelineV2(device='cpu', cpu_threads=4, enable_mkldnn=False,
    use_doc_orientation_classify=False, use_doc_unwarping=False, **kwargs)
results = []
for image in sys.argv[2:]:
    tables = []
    for result in pipeline.predict(image, use_table_orientation_classify=False):
        for table in result.get('table_res_list', []):
            html = table.get('pred_html', '')
            if html: tables.append({'html': html})
    results.append({'tables': tables})
pathlib.Path(sys.argv[1]).write_text(json.dumps(results, ensure_ascii=False))
