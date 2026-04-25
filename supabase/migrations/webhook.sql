-- ClearChain — Webhook support for API keys
-- Run once in Supabase SQL Editor.

alter table api_keys add column webhook_url text;
alter table api_keys add column webhook_secret text;

-- webhook_url  : HTTPS endpoint ClearChain POSTs analysis JSON to after each /api/analyze call.
-- webhook_secret : Optional user-defined secret. If set, ClearChain includes
--                  X-ClearChain-Signature: sha256=<hmac> so the receiving server
--                  can verify authenticity of the payload.
