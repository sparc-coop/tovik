FROM vllm/vllm-openai:latest

ENV MODEL_NAME facebook/opt-125m

ENTRYPOINT python3 -m vllm.entrypoints.openai.api_server --model $MODEL_NAME $VLLM_ARGS