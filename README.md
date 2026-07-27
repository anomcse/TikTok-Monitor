# TTKLiveMonitor V1.0

Bot + dashboard para monitoramento de lives no TikTok.

## Rodar local

```bash
npm install
npm run dev
```

Scripts:

- `npm run bot` -> inicia bot
- `npm run dashboard` -> inicia dashboard
- `npm run dev` -> bot + dashboard juntos

## Alertas customizados (gifts)

No `config.json`:

```json
{
  "alerts": {
    "gifts": {
      "enabled": true,
      "minRepeatCount": 5,
      "minCoins": 100,
      "names": []
    }
  }
}
```

Notas:
- `minRepeatCount` e `minCoins` funcionam como gatilhos (se um deles bater, dispara).
- `names` filtra por nome de gift (contém, case-insensitive). Se vazio, aceita qualquer gift.

## Configuração do .env

Antes de rodar, preencha o arquivo `.env` na raiz do projeto:

```
TIKTOK_SESSIONID=
TIKTOK_SIGN_API_KEY=
TIKTOK_TT_TARGET_IDC=
HEALTH_HOST=0.0.0.0
HEALTH_PORT=8787
```

### TIKTOK_SESSIONID (recomendado)

O `sessionid` é o cookie de autenticação da sua conta TikTok. Ele melhora muito a estabilidade da conexão com lives.

Como pegar:
1. Abra o TikTok no navegador: https://www.tiktok.com
2. Faça login na sua conta
3. Abra o DevTools (F12) → aba **Application** (Chrome) ou **Storage** (Firefox)
4. Vá em **Cookies** → `https://www.tiktok.com`
5. Copie o valor do cookie chamado `sessionid`

Cole no `.env`:
```
TIKTOK_SESSIONID=seu_valor_aqui
```

> **Atenção:** use uma conta secundária. O TikTok pode banir ou limitar contas que fazem scraping de lives.

### TIKTOK_SIGN_API_KEY (necessário para conexões estáveis)

O TikTok exige que as requisições à API Webcast sejam assinadas. O projeto usa o serviço de sign server do Euler (https://www.eulerstream.com).

Como obter:
1. Acesse https://www.eulerstream.com e crie uma conta
2. Gere uma API key no painel
3. A chave tem o formato `euler_XXXXXXXX...`

Cole no `.env`:
```
TIKTOK_SIGN_API_KEY=euler_sua_chave_aqui
```

> Sem essa chave, conexões com lives populares tendem a falhar ou cair frequentemente.

### TIKTOK_TT_TARGET_IDC (opcional)

O `tt-target-idc` indica o datacenter do TikTok ao qual a live está conectada. Melhora a estabilidade em algumas regiões.

Como pegar (opcional):
1. Abra o DevTools → aba **Network** enquanto assiste uma live no browser
2. Filtre por `webcast` nas requisições
3. Procure o header de resposta `tt-target-idc` em qualquer requisição ao domínio `webcast.tiktok.com`
4. Copie o valor (ex: `maliva-useast-1`)

Cole no `.env`:
```
TIKTOK_TT_TARGET_IDC=maliva-useast-1
```

> Se deixado em branco, o bot ignora esse parâmetro automaticamente — não causa erro.

## Log rotation

Em `config.json`:

```json
{
  "logRotation": {
    "maxFileBytes": 10485760,
    "maxBackups": 3
  }
}
```

## Circuit breaker (auto-pause)

Se o circuito abrir, o bot pode pausar automaticamente o streamer. Por padrão, ele retoma após o cooldown do circuito:

```json
{
  "autoPauseOnCircuitOpen": {
    "enabled": true,
    "autoResume": true,
    "autoResumeMs": 300000
  }
}
```

### Pausa automática definitiva (hard pause)

Além do auto-pause acima, existe uma segunda camada de proteção: se o
circuito abrir várias vezes seguidas para um streamer e **nenhum evento real**
(chat/gift/member/etc) jamais tiver sido recebido, o bot entende que não é
instabilidade passageira e sim um bloqueio estrutural — sign key/sessão
ausentes ou inválidas, ou o IP do servidor sendo limitado pelo TikTok/Euler
Stream. Nesse caso ele **pausa e não retoma sozinho**, evitando ficar girando
24/7 sem nunca funcionar. Configurável em `config.json`:

```json
{
  "circuitBreaker": {
    "hardPauseAfterOpens": 5
  }
}
```

Quando isso acontece você verá um erro `hard_paused_no_events_ever` no log e
no dashboard. Corrija as variáveis de ambiente (veja a seção de deploy no
Render abaixo) e retome manualmente pelo dashboard ou via API.

## Deploy no Render (ou qualquer PaaS gratuito)

Se o bot conecta, "entra" na live, mas nunca recebe nenhum evento e o plano
free acaba rápido, quase sempre é uma combinação destes dois pontos:

1. **As variáveis de ambiente não foram configuradas no Render.** O arquivo
   `.env` é local e nunca é enviado para o Render junto do código. Vá em
   *Settings → Environment* do seu serviço no Render e adicione manualmente
   `TIKTOK_SESSIONID`, `TIKTOK_SIGN_API_KEY` (e `TIKTOK_TT_TARGET_IDC` se
   tiver). Sem `TIKTOK_SIGN_API_KEY`, o bot usa assinatura anônima do Euler
   Stream, que tem cota muito baixa — o handshake inicial pode até
   completar, mas o WebSocket de chat não recebe dados de verdade.
2. **IP de datacenter.** Mesmo com uma sign key válida, hosts como Render,
   Railway e Heroku usam IPs compartilhados de datacenter, que o TikTok e o
   Euler Stream limitam/bloqueiam com muito mais agressividade do que um IP
   residencial. Isso é a causa nº1, bem documentada, de bots com
   `tiktok-live-connector` funcionarem local e falharem na nuvem. Se mesmo
   com sign key + sessão as conexões continuarem instáveis, considere um
   plano pago da Euler Stream com suporte a proxy residencial, ou hospedar em
   algo com IP mais "limpo".

Outros pontos importantes para produção:

- **Disco efêmero:** no plano free do Render o filesystem é resetado a cada
  deploy/restart. Logs em `logs/`, `logs_jsonl/`, `dashboard/status.json` e
  `streamers.txt` editado pelo dashboard **não persistem** entre deploys. Se
  precisar manter histórico, use um Disk pago do Render ou exporte os dados
  para um serviço externo.
- **Processo sempre ativo:** este bot precisa ficar rodando continuamente
  (não é um serviço que responde a requisições esporádicas). Isso significa
  que ele naturalmente consome a franquia de horas do plano free ao longo do
  mês — é esperado, não é bug. O que este projeto corrige é o **loop de
  reconexão infinito quando a conexão nunca funciona de verdade**, que era o
  que fazia as horas acabarem muito mais rápido do que o esperado mesmo sem
  nenhum evento útil sendo entregue.
- **`npm ci`:** o Render normalmente roda `npm ci` no build quando existe
  `package-lock.json`. Garanta que o lockfile está sincronizado com o
  `package.json` (rode `npm install` localmente e commite o lockfile
  atualizado sempre que mudar uma dependência).

## PM2

```bash
pm2 delete all
pm2 start ecosystem.config.cjs
pm2 save
pm2 ls
```

Bot e dashboard sobem juntos e aparecem como um único processo **TTKLM** no `pm2 ls`.

Para parar, reiniciar ou ver logs:

```bash
pm2 stop TTKLM
pm2 restart TTKLM
pm2 logs TTKLM
```

## Limpeza rapida (se dashboard travar)

```bash
pm2 stop all
pm2 delete all
del /f /q dashboard\status.json
rmdir /s /q logs_jsonl
rmdir /s /q logs
rmdir /s /q logs_highlight
mkdir logs
mkdir logs_jsonl
mkdir logs_highlight
```

## Identidade visual TikTok (dashboard)

### Icone no topo do dashboard

Coloque o arquivo:

- `dashboard/public/assets/tiktok-icon.png`

### Icone da aba do navegador (favicon)

Coloque os arquivos:

- `dashboard/public/favicon.ico`
- `dashboard/public/favicon-32x32.png`
- `dashboard/public/apple-touch-icon.png`

Assim que os arquivos existirem, o dashboard passa a usar automaticamente.
