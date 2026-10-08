# Release Checklist — SHINY STORE

## 0. Gate de segurança

- [ ] Não existe autorização para teste financeiro real nesta etapa.
- [ ] Promisse não foi chamada.
- [ ] Nenhuma cobrança real foi criada.
- [ ] Nenhum webhook financeiro real foi enviado.
- [ ] .env.local não foi lido.
- [ ] Importador de dados reais não foi executado.

## 1. Código

- [ ] TypeScript PASS.
- [ ] Build de produção PASS.
- [ ] npm audit --audit-level=high PASS.
- [ ] package-lock.json versionado.
- [ ] DATABASE_REQUIRED=true.
- [ ] SHINY_STORAGE_MODE=database.
- [ ] Production falha fechado se configuração obrigatória faltar.
- [ ] Não há fallback JSON em Production.
- [ ] SESSION_HMAC_SECRET é dedicado.
- [ ] WEBHOOK_ENCRYPTION_KEY é dedicado.
- [ ] CRON_SECRET é dedicado.
- [ ] ADMIN_ACCESS_LEVEL=OWNER.
- [ ] HCaptcha site key + secret configurados no ambiente testado.
- [ ] Nenhum secret hardcoded.

## 2. Arquivo de ambiente

- [ ] .env.example contém todos os nomes necessários sem valores reais.
- [ ] .env.local não está no Git.
- [ ] .env não está no Git.
- [ ] Storage/ não está no Git.
- [ ] Logs/ não está no Git.
- [ ] .next/, .vercel/, caches e artefatos locais não estão no Git.
- [ ] node_modules/ não está no Git.

## 3. GitHub

- [ ] Repositório remoto correto.
- [ ] Secret Scanning habilitado.
- [ ] Push Protection habilitado.
- [ ] Dependabot alerts/security updates habilitados.
- [ ] Branch principal protegida.
- [ ] Nenhum secret aparece em git grep.
- [ ] Primeiro commit contém somente código/documentação/configuração segura.
- [ ] git status --short revisado antes do commit.

Comandos de pré-push:

    git status --short
    git ls-files
    git check-ignore -v .env .env.local Storage Logs .next node_modules .vercel
    git grep -n -I -E 'sk_live_|whsec_|BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY'

Não usar git add -f para arquivos ignorados.

## 4. Neon

- [ ] Projeto Production: shiny-store-prod.
- [ ] Região: aws-sa-east-1.
- [ ] Migrations 001–005 aplicadas.
- [ ] schema_migrations validado.
- [ ] 27 tabelas validadas.
- [ ] Concorrência de estoque PASS.
- [ ] Concorrência de cupons PASS.
- [ ] Restore isolado PASS.
- [ ] DATABASE_URL inserida somente no ambiente correto.
- [ ] Backup automático/snapshot schedule habilitado ou limitação formalmente aceita.
- [ ] Não executar importador real nesta etapa.

## 5. Vercel Preview

- [ ] Projeto correto vinculado.
- [ ] DATABASE_URL de Preview configurada.
- [ ] Secrets criptográficos de Preview configurados.
- [ ] Admin de Preview configurado.
- [ ] HCaptcha de Preview configurado.
- [ ] Sem chave Promisse live.
- [ ] Deploy Preview PASS.
- [ ] Smoke test sem cobrança.
- [ ] Login/registro/CSRF testados.
- [ ] HCaptcha validado live.
- [ ] Checkout permanece bloqueado enquanto Promisse não estiver configurada.
- [ ] Webhook Promisse sem segredo não aceita mutação financeira.

## 6. Reconciliação

O código não tenta descobrir transações arbitrárias na Promisse: o contrato documentado só permite consulta por transactionId.

- [ ] GET /transactions/:id usado somente quando há ID conhecido.
- [ ] Webhooks não associados ficam pendentes e podem retornar 202.
- [ ] Eventos inválidos/assinatura inválida não mutam finanças.
- [ ] Divergência de valor gera rejeição/alerta.
- [ ] PAID não sofre downgrade.
- [ ] Tentativas possuem backoff e limite.
- [ ] Advisory lock/transaction curta validados.
- [ ] Nenhuma chamada HTTP externa ocorre dentro de transação DB.

## 7. Cron

O vercel.json mantém */5 * * * *.

A conta Vercel atual está no Hobby e rejeita essa frequência. Portanto, antes da Production:

- [ ] Upgrade para plano que aceite 5 minutos, ou
- [ ] scheduler externo autorizado configurado para chamar /Api/Internal/Reconciliation.

O scheduler deve enviar:

    Authorization: Bearer <CRON_SECRET>

Nunca colocar CRON_SECRET no código, URL, query string ou GitHub.

## 8. Alertas

- [ ] Alertas CRITICAL persistidos no Neon.
- [ ] Destino externo escolhido.
- [ ] Destino externo configurado com segredo fora do Git.
- [ ] Teste de alerta executado sem dados financeiros reais.

## 9. Production

Só liberar quando todos os gates anteriores estiverem PASS:

- [ ] Plano/scheduler do cron resolvido.
- [ ] Neon confirmado.
- [ ] Backup/restore operacional.
- [ ] Secrets Production configurados.
- [ ] HCaptcha Production configurado.
- [ ] Preview validado.
- [ ] Alertas externos validados.
- [ ] Rollback conhecido.
- [ ] Deploy Production PASS.

Gate financeiro separado:

AUTORIZO TESTE FINANCEIRO REAL CONTROLADO

Sem essa frase, não executar cobrança real.
