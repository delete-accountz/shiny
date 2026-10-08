# Deploy Vercel — procedimento final

## Projeto

Vercel: delete-accountz/shiny-store
Project ID: prj_4jOKd5ssamuN85JhEZpgjCkWcM4q
Região: gru1
Neon Production: shiny-store-prod / aws-sa-east-1

## 1. Configurar Preview

No projeto Vercel, configure as variáveis para Preview:

DATABASE_REQUIRED=true
SHINY_STORAGE_MODE=database
DATABASE_URL=<connection string do branch Neon Preview>
SESSION_HMAC_SECRET=<secret dedicado>
WEBHOOK_ENCRYPTION_KEY=<secret dedicado>
CRON_SECRET=<secret dedicado>
RECONCILIATION_AUTOMATION_ENABLED=false
ADMIN_USER=<usuário>
ADMIN_ACCESS_KEY=<secret>
ADMIN_ACCESS_LEVEL=OWNER
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=<site key Preview>
HCAPTCHA_SECRET_KEY=<secret hCaptcha Preview>
TRUSTED_PROXY=false
TRUSTED_PROXY_HEADER=x-real-ip
PROMISSE_API_BASE_URL=https://api.promisse.com.br

Não adicionar PROMISSE_API_KEY real nem PROMISSE_WEBHOOK_SECRET real no Preview desta etapa.

## 2. Validar Preview

O primeiro teste deve ser não financeiro.

Sem DATABASE_URL, o runtime deve responder 503 com production_configuration_incomplete. Isso é fail-closed e é esperado.

Com a configuração completa de Preview:

1. abrir a URL protegida da Vercel;
2. validar página inicial;
3. validar registro/login;
4. validar CSRF;
5. validar hCaptcha;
6. validar endpoints administrativos autorizados;
7. confirmar que checkout continua bloqueado enquanto Promisse não estiver configurada;
8. confirmar que não houve chamada Promisse.

Não usar cartão, não criar cobrança e não enviar webhook financeiro.

## 3. HCaptcha

No painel hCaptcha:

1. criar site para Preview;
2. adicionar o hostname do Preview;
3. colocar a Site Key em NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
4. colocar o Secret em HCAPTCHA_SECRET_KEY;
5. redeployar Preview;
6. executar o fluxo real de hCaptcha;
7. confirmar sucesso e falha de validação.

Para Production, repetir com hostname Production e credenciais próprias.

## 4. Production

Somente depois do Preview:

DATABASE_REQUIRED=true
SHINY_STORAGE_MODE=database
DATABASE_URL=<Neon Production>
SESSION_HMAC_SECRET=<Production>
WEBHOOK_ENCRYPTION_KEY=<Production>
CRON_SECRET=<Production>
RECONCILIATION_AUTOMATION_ENABLED=true
ADMIN_USER=<Production>
ADMIN_ACCESS_KEY=<Production>
ADMIN_ACCESS_LEVEL=OWNER
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=<Production>
HCAPTCHA_SECRET_KEY=<Production>
TRUSTED_PROXY=false
TRUSTED_PROXY_HEADER=x-real-ip
PROMISSE_API_BASE_URL=https://api.promisse.com.br

As credenciais Promisse ficam fora deste gate até autorização financeira.

## 5. Cron e plano Hobby

O vercel.json declara:

    */5 * * * *

O plano Hobby atual rejeita essa frequência. Não fazer upgrade automaticamente.

Há duas opções:

A. usar um plano Vercel compatível com cron de 5 minutos; ou

B. remover o cron da configuração efetiva de Production e usar um scheduler HTTP externo autorizado.

No caso B, o scheduler chama:

    GET /Api/Internal/Reconciliation

com:

    Authorization: Bearer <CRON_SECRET>

O endpoint também exige RECONCILIATION_AUTOMATION_ENABLED=true.

Não enviar CRON_SECRET em URL/query string.

## 6. Deploy

Preview:

    vercel deploy --target preview

Production somente depois dos gates:

    vercel deploy --prod

Não usar vercel env pull.

## 7. Pós-deploy

Verificar:

- runtime responde normalmente;
- DATABASE_REQUIRED e database mode corretos;
- HCaptcha validado;
- cron/scheduler autenticado;
- alertas CRITICAL persistidos;
- logs não expõem secrets;
- checkout sem Promisse permanece bloqueado;
- nenhuma cobrança real foi criada;
- nenhuma chamada Promisse ocorreu.

## 8. Rollback

Rollback de aplicação:

1. identificar deployment atual;
2. suspender mutações se houver risco;
3. promover deployment anterior;
4. não desfazer pagamentos por rollback de código;
5. consultar PENDING;
6. reconciliar depois da recuperação;
7. verificar alertas.

Rollback de migration deve preferir forward migration. Nunca executar DROP/DELETE destrutivo automaticamente.
