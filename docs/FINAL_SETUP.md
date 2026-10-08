# Preparação final — ordem de execução

Este documento é o roteiro curto depois desta preparação.

## 1. GitHub

Na máquina:

    cd C:\Users\Administrator\Documents\Shiny\Site\Shiny-Site
    git init
    git branch -M main
    git remote add origin <REPOSITÓRIO>

Revisar:

    git status --short --ignored
    git check-ignore -v .env .env.local Storage Logs .next node_modules .vercel

Depois revisar o staged set, criar o commit e fazer push.

Nunca usar git add -f para .env, Storage, Logs ou secrets.

## 2. Neon

Production já existe:

- projeto: shiny-store-prod
- região: aws-sa-east-1
- migrations: 001–005
- schema: 27 tabelas

Para Preview, usar branch separado quando possível.

Copiar a connection string correta diretamente para Vercel como DATABASE_URL.

Não copiar DATABASE_URL para o Git.
Não executar importador de JSON real.

## 3. Vercel — Preview

Configurar:

| Nome | Preview |
|---|---|
| DATABASE_REQUIRED | true |
| SHINY_STORAGE_MODE | database |
| DATABASE_URL | Secret Neon Preview |
| SESSION_HMAC_SECRET | Secret dedicado |
| WEBHOOK_ENCRYPTION_KEY | Secret dedicado |
| CRON_SECRET | Secret dedicado |
| RECONCILIATION_AUTOMATION_ENABLED | false |
| ADMIN_USER | usuário |
| ADMIN_ACCESS_KEY | Secret dedicado |
| ADMIN_ACCESS_LEVEL | OWNER |
| NEXT_PUBLIC_HCAPTCHA_SITE_KEY | Site Key Preview |
| HCAPTCHA_SECRET_KEY | Secret hCaptcha Preview |
| TRUSTED_PROXY | false |
| TRUSTED_PROXY_HEADER | x-real-ip |
| PROMISSE_API_BASE_URL | https://api.promisse.com.br |

Não configurar PROMISSE_API_KEY live nem PROMISSE_WEBHOOK_SECRET real no Preview desta etapa.

## 4. HCaptcha

Criar uma configuração para o hostname do Preview.

Colocar:

- Site Key -> NEXT_PUBLIC_HCAPTCHA_SITE_KEY
- Secret -> HCAPTCHA_SECRET_KEY

Testar registro/login/fluxo protegido.

Depois repetir com hostname e credenciais próprias de Production.

## 5. Validação Preview

Executar:

    npm run validate:release

O comando local exige variáveis fornecidas explicitamente no processo; ele não carrega .env.local.

Na Vercel:

- deploy Preview;
- validar página;
- validar autenticação;
- validar CSRF;
- validar hCaptcha;
- confirmar ausência de chave Promisse live;
- confirmar checkout bloqueado sem credenciais Promisse.

Sem DATABASE_URL, o runtime deve falhar fechado com 503.

## 6. Production

Antes do deploy Production, configurar:

- DATABASE_URL Production;
- SESSION_HMAC_SECRET Production;
- WEBHOOK_ENCRYPTION_KEY Production;
- CRON_SECRET Production;
- ADMIN_USER/ADMIN_ACCESS_KEY Production;
- ADMIN_ACCESS_LEVEL=OWNER;
- hCaptcha Production;
- RECONCILIATION_AUTOMATION_ENABLED=true.

Depois resolver o cron de 5 minutos.

## 7. Cron

vercel.json mantém */5 * * * *.

Hobby não aceita essa frequência.

Escolher:

A. plano Vercel compatível; ou
B. scheduler HTTP externo autorizado.

O scheduler externo chama:

    GET /Api/Internal/Reconciliation

Header:

    Authorization: Bearer <CRON_SECRET>

## 8. Backup

O snapshot manual e restore já foram validados.

O backup automático do Neon continua pendente porque o projeto atual não habilitou o recurso.

Quando disponível, habilitar a política automática e executar restore isolado de verificação.

## 9. Alertas

Os alertas CRITICAL já são persistidos no Neon.

Ainda falta escolher um destino externo.

Configurar o destino escolhido sem colocar webhook/token no Git e executar teste sintético.

## 10. Promisse

Não configurar chave live nem executar chamada nesta preparação.

A liberação financeira continua separada e exige exatamente:

AUTORIZO TESTE FINANCEIRO REAL CONTROLADO

Sem essa frase:

- zero chamadas Promisse;
- zero cobrança;
- zero webhook financeiro real.
