import logging
import os
import tempfile
import azure.functions as func
from azure.storage.blob import BlobServiceClient

# https://tovik-convert-h0czgzdtg3cud0b2.centralus-01.azurewebsites.net/runtime/webhooks/blobs?functionName=Host.Functions.EventGridBlobTrigger&code=<BLOB_EXTENSION_KEY>

from pdf2docx import Converter

app = func.FunctionApp()

@app.blob_trigger(arg_name="inputblob", path="documents", source="EventGrid", connection="sparcv2_STORAGE") 
def EventGridBlobTrigger(inputblob: func.InputStream):
    logging.info(f'Processing blob: {inputblob.name}')

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, os.path.basename(inputblob.name))
        logging.info(f'Saving PDF to temporary path: {pdf_path}')

        with open(pdf_path, 'wb') as f:
            f.write(inputblob.read())

        docx_filename = inputblob.name.replace('.pdf', '.docx').replace('documents/', '')
        docx_path = os.path.join(tmpdir, os.path.basename(docx_filename))
        logging.info(f'Converting PDF to DOCX: {pdf_path} -> {docx_path}')

        cv = Converter(pdf_path)
        cv.convert(docx_path)
        cv.close()

        # Upload using azure-storage-blob
        blob_conn_str = os.getenv("sparcv2_STORAGE")
        blob_service_client = BlobServiceClient.from_connection_string(blob_conn_str)
        container_client = blob_service_client.get_container_client("documents")
        with open(docx_path, 'rb') as docx_file:
            container_client.upload_blob(name=docx_filename, data=docx_file, overwrite=True)
            logging.info(f'Uploaded DOCX to blob storage: {docx_filename}')
    logging.info(f'Converted and uploaded DOCX for: {inputblob.name}')
