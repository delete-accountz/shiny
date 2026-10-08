# Configuração de ambiente e Secrets

## Regra

Nunca ler, copiar ou publicar valores de .env.local. Secrets pertencem somente ao provedor de runtime.

O projeto usa PostgreSQL no modo de produção e falha fechado quando a configuração obrigatória está incompleta.

## Variáveis — Preview

| Variável | Valor/fonte |
|---|---|
| DATABASE_REQUIRED | true |
| SHINY_STORAGE_MODE | database |
| DATABASE_URL | Secret do branch Neon de Preview |
| SESSION_HMAC_SECRET | Secret dedicado ao Preview |
| WEBHOOK_ENCRYPTION_KEY | Secret dedicado ao Preview |
| CRON_SECRET | Secret dedicado ao Preview |
| RECONCILIATION_AUTOMATION_ENABLED | false por padrão; true somente se o cron/scheduler for validado |
| ADMIN_USER | usuário administrativo do Preview |
| ADMIN_ACCESS_KEY | Secret administrativo do Preview |
| ADMIN_ACCESS_LEVEL | OWNER |
| NEXT_PUBLIC_HCAPTCHA_SITE_KEY | Site key do hostname de Preview |
| HCAPTCHA_SECRET_KEY | Secret do site hCaptcha de Preview |
| TRUSTED_PROXY | false |
| TRUSTED_PROXY_HEADER | x-real-ip |
| PROMISSE_API_BASE_URL | https://api.promisse.com.br |
| PROMISSE_API_KEY | não configurar com chave live nesta etapa |
| PROMISSE_WEBHOOK_SECRET | não configurar segredo real nesta etapa |
| PROMISSE_WEBHOOK_URL | URL de webhook do ambiente, somente quando o fluxo financeiro for autorizado |

## Variáveis — Production

Production usa os mesmos nomes, mas com valores dedicados ao ambiente Production:

- DATABASE_REQUIRED=true
- SHINY_STORAGE_MODE=database
- DATABASE_URL
- SESSION_HMAC_SECRET
- WEBHOOK_ENCRYPTION_KEY
- CRON_SECRET
- RECONCILIATION_AUTOMATION_ENABLED=true
- ADMIN_USER
- ADMIN_ACCESS_KEY
- ADMIN_ACCESS_LEVEL=OWNER
- NEXT_PUBLIC_HCAPTCHA_SITE_KEY
- HCAPTCHA_SECRET_KEY
- TRUSTED_PROXY=false
- TRUSTED_PROXY_HEADER=x-real-ip
- PROMISSE_API_BASE_URL=https://api.promisse.com.br

As credenciais Promisse (PROMISSE_API_KEY e PROMISSE_WEBHOOK_SECRET) só entram quando houver autorização financeira separada. Não usar a chave live no Preview.

## DATABASE_URL — Neon

1. Abra o projeto Neon shiny-store-prod.
2. Para Production, use a connection string do banco/role de produção.
3. Para Preview, prefira um branch Neon separado.
4. Na Vercel, adicione a string diretamente como Secret/Environment Variable para o ambiente correto.
5. Não cole a string no Git, em documentação, em código ou em .env.example.
6. Não use vercel env pull neste projeto.

A aplicação não usa fallback JSON quando SHINY_STORAGE_MODE=database e DATABASE_REQUIRED=true.

## Secrets criptográficos

Gere três valores aleatórios independentes e longos:

- SESSION_HMAC_SECRET
- WEBHOOK_ENCRYPTION_KEY
- CRON_SECRET

Nunca reutilize a mesma chave entre eles ou entre Preview e Production.

WEBHOOK_ENCRYPTION_KEY protege segredos de webhooks armazenados no banco. SESSION_HMAC_SECRET assina o estado de sessão PostgreSQL. CRON_SECRET autentica o scheduler de reconciliação.

## hCaptcha

1. Crie um site hCaptcha separado para o ambiente desejado.
2. Cadastre o hostname exato usado pelo Preview.
3. Copie a Site Key para NEXT_PUBLIC_HCAPTCHA_SITE_KEY.
4. Copie o Secret somente para HCAPTCHA_SECRET_KEY.
5. Nunca coloque o secret em NEXT_PUBLIC_*.
6. Repita com configuração própria para Production.
7. Valide o fluxo no Preview antes de liberar Production.

O backend considera hCaptcha não configurado quando o secret ou a site key não existe.

## Promisse

Contrato usado pelo código:

- base: https://api.promisse.com.br
- POST /transactions
- GET /transactions/:id
- Authorization: <API_KEY> sem Bearer
- valor em centavos
- webhook HMAC-SHA256 sobre o body bruto

Não inventar sandbox, idempotency key do provedor, listagem de transações, cancelamento, refund ou estados não documentados.

## Ausência de banco

Em Production, configuração incompleta gera:

503 {"error":"production_configuration_incomplete"}

O runtime não deve migrar silenciosamente para JSON.

## Validação sem risco financeiro

O script não carrega .env.local, não faz chamadas externas e não chama Promisse:

- npm run validate:release
- npm run validate:production

Ele verifica somente presença/configuração e nunca imprime os valores dos secrets.

Promisse calls: 0, Charges created: 0 e Webhooks sent: 0 devem permanecer assim durante esta preparação.
