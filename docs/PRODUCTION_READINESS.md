# Production Readiness

## Status desta preparação

O código e os artefatos foram preparados para o push e configuração remota, mas o sistema continua NÃO PRONTO para cobrança real.

Promisse não foi chamada. Nenhuma cobrança real foi criada. Nenhum webhook financeiro real foi enviado. Dados financeiros reais não foram importados ou alterados.

## Controles de runtime

Production agora possui um gate central em Src/Lib/PRODUCTION_CONFIG.ts.

Se qualquer requisito operacional obrigatório estiver ausente, o proxy retorna:

503 production_configuration_incomplete

O gate exige presença de:

- DATABASE_URL
- SESSION_HMAC_SECRET
- WEBHOOK_ENCRYPTION_KEY
- CRON_SECRET
- ADMIN_USER
- ADMIN_ACCESS_KEY
- ADMIN_ACCESS_LEVEL=OWNER
- NEXT_PUBLIC_HCAPTCHA_SITE_KEY
- HCAPTCHA_SECRET_KEY
- RECONCILIATION_AUTOMATION_ENABLED=true

Além disso:

- DATABASE_REQUIRED deve ser true;
- SHINY_STORAGE_MODE deve ser database.

Credenciais Promisse não são exigidas pelo gate de infraestrutura. Isso permite Preview sem risco financeiro e impede inventar sandbox.

## Neon

- Projeto: shiny-store-prod
- Project ID: square-flower-70047569
- Região: AWS South America East 1 / aws-sa-east-1
- PostgreSQL 17
- Migrations 001–005 aplicadas
- 27 tabelas públicas validadas
- concorrência de estoque PASS
- concorrência de cupom PASS
- restore isolado PASS
- snapshot post-migration-history criado
- backup automático não habilitado porque o recurso foi recusado pelo projeto/plano atual

## Vercel

- Projeto: delete-accountz/shiny-store
- Project ID: prj_4jOKd5ssamuN85JhEZpgjCkWcM4q
- região: gru1
- Preview técnico já publicado
- Preview sem DATABASE_URL demonstrou fail-closed
- cron declarado em vercel.json: */5 * * * *
- plano Hobby atual não aceita essa frequência
- não houve upgrade automático

Production requer plano compatível ou scheduler externo autorizado.

## HCaptcha

O código suporta validação server-side e usa:

- NEXT_PUBLIC_HCAPTCHA_SITE_KEY
- HCAPTCHA_SECRET_KEY

Validação live ainda depende de configurar as chaves no ambiente remoto.

## Promisse

O worker usa somente GET /transactions/:id quando existe transactionId conhecido.

Não existe descoberta arbitrária de transações porque o contrato disponível não documenta endpoint de listagem. Não inventar esse mecanismo.

## Validações locais

Scripts:

    npm run typecheck
    npm run build
    npm run audit
    npm run validate:release
    npm run validate:production

O validador de release não carrega .env.local, não faz rede e não chama Promisse.

## Bloqueadores restantes

1. Configurar DATABASE_URL em Preview e Production.
2. Configurar os secrets criptográficos e administrativos em ambos os ambientes.
3. Configurar HCaptcha real e validar Preview.
4. Resolver cron de 5 minutos por plano Vercel compatível ou scheduler externo.
5. Configurar backup automático quando o recurso estiver disponível; até lá manter procedimento de snapshot/restore.
6. Escolher e configurar destino externo para alertas CRITICAL.
7. Configurar credenciais Promisse somente após autorização financeira.
8. Executar deploy Production somente depois dos gates anteriores.

## Gate financeiro

A preparação desta etapa não libera cobrança.

A frase de autorização continua sendo:

AUTORIZO TESTE FINANCEIRO REAL CONTROLADO
