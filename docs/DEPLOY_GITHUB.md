# GitHub — primeiro push limpo

## Estado

O diretório do projeto ainda não é um repositório Git local. Nenhum commit ou push foi feito por esta preparação.

## Antes do primeiro commit

O .gitignore já exclui:

- .env e .env.*
- Storage/
- Logs/
- .next/
- .vercel/
- node_modules/
- caches
- backups
- certificados e chaves
- relatórios de teste

O .vercelignore também exclui dados locais, testes, docs, migrations, scripts e artefatos de desenvolvimento do deploy Vercel.

Não apagar .env.local apenas para limpar o Git; o objetivo é que ele permaneça fora do índice.

## Procedimento recomendado

Na pasta do projeto:

    git init
    git branch -M main
    git remote add origin <SEU_REPOSITÓRIO_GITHUB>

Antes de adicionar arquivos:

    git status --short --ignored
    git check-ignore -v .env .env.local Storage Logs .next node_modules .vercel

Depois, revisar o conjunto de arquivos que será commitado:

    git add .
    git status --short

Se algum .env, Storage, Logs, .next, node_modules ou secret aparecer no staged set, interromper.

Criar o commit somente após a revisão:

    git commit -m "Prepare production deployment"

Depois:

    git push -u origin main

O usuário executa o add/commit/push manualmente para manter controle do repositório.

## Scan de secrets

Executar sobre arquivos versionados:

    git grep -n -I -E 'sk_live_|whsec_|BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY'

Também revisar nomes e conteúdo de configurações manualmente sem abrir .env.local.

## GitHub

Ativar:

- Secret Scanning;
- Push Protection;
- Dependabot alerts;
- Dependabot security updates;
- branch protection;
- revisão obrigatória;
- ambientes separados para Production e Preview.

Se uma credencial real já tiver entrado no histórico, removê-la do arquivo não basta: revogar/rotacionar a credencial e tratar o histórico.

## Lockfile

package-lock.json já foi criado e deve ser versionado.

Não trocar o gerenciador de pacotes nesta etapa.
