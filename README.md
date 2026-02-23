# 🖥️ Neural Override: Cybernetic Breach

> Um jogo de reflexo e leitura rápida com estética cyberpunk. Invada sistemas, capture pacotes de dados e mantenha sua conexão estável antes que a sessão expire.

---

## ⏱️ Duração e Fim de Jogo

O jogo tem **quantidade fixa de blocos**, não tempo fixo.

- A sessão contém exatamente **200 blocos pontuáveis** (Padrão + Criptografado)
- Malware e Vírus **não fazem parte** dessa contagem — eles só atrapalham
- O jogo termina quando os 200 blocos pontuáveis tiverem **passado pela tela** (capturados ou não) e não hajá mais nenhum desses blocos na tela
- Após os 200, o spawner continua gerando apenas Malware e Vírus até o último bloco pontuável sair da tela
- A **pontuação final** = quantos desses 200 o jogador capturou corretamente (máx 200)

> **Duração estimada:** 3–5 minutos, dependendo da velocidade e dos erros do jogador.

---

## 🎮 Como Jogar

As **5 colunas** na base do jogo são: **Z · X · C · V · B**

Blocos caem de cima para baixo. Quando um bloco entra na **zona de captura** (barra iluminada), pressione a ação correta.

### Tipos de Bloco

| Tipo | Formato | Ação |
|---|---|---|
| **Padrão** | `RT7` | Pressione a **tecla da coluna** (Z / X / C / V / B) |
| **Criptografado** | `@HX4` | Pressione **SHIFT + tecla da coluna** |
| **Malware** | `A!5` | ⚠️ **NÃO pressione nada** — deixe passar |
| **Vírus** | `😈` | Pressione **ESPAÇO** na zona de captura |

> **Dica SHIFT:** Você pode manter o SHIFT pressionado *antes* do bloco criptografado chegar. Só há erro se pressionar SHIFT + coluna em um bloco que **não** seja criptografado.

### Controles Gerais

| Tecla | Ação |
|---|---|
| `Z` `X` `C` `V` `B` | Capturar bloco da coluna correspondente |
| `SHIFT + coluna` | Capturar bloco criptografado |
| `ESPAÇO` | Eliminar vírus |
| `1` `2` `3` | Ativar power-up |
| `ENTER` | Pausar / retomar |
| `ESC` | Voltar ao menu principal |

---

## ⚙️ Mecânicas Principais

### Score e Circuitos

- Cada **6 pontos** acende 1 circuito no painel de hardware (máx. 30 exibidos)
- Score máximo: **200 pontos** → fim de jogo

### Integridade de Conexão

- O jogador tem **4 erros consecutivos** antes de sofrer uma quebra de circuito
- Erros consecutivos são resetados a cada acerto correto
- O **SHIELD** (power-up) suspende o acúmulo de erros enquanto ativo

### Quebra de Circuito

Ao cometer **4 erros seguidos**:

1. O circuito atual é marcado com um **✕ vermelho** permanente no painel
2. O score é revertido ao início do circuito atual (perda parcial de progresso)
3. A integridade é restaurada a 4/4
4. O jogo **continua** — a sessão só termina quando os 200 blocos pontuáveis tiverem passado

### Vírus Não Eliminado

Se um vírus passar pela zona de captura sem ser atingido pelo ESPAÇO, além do erro, um **glitch visual de 3 segundos** afeta o canvas, dificultando a visão dos próximos blocos.

### Velocidade

- **Velocidade** inicial: **90 px/s** — aumenta a cada 20 blocos (8 degraus até o 160):

  | Bloco | Velocidade |
  |---|---|
  | 20 | 112 px/s |
  | 40 | 134 px/s |
  | 60 | 156 px/s |
  | 80 | 178 px/s |
  | 100 | 200 px/s |
  | 120 | 222 px/s |
  | 140 | 244 px/s |
  | 160 | **260 px/s** (máxima) |

- A velocidade máxima é atingida por volta de ~75–80 pts, ≈40% da partida.
- Frequência de Malware e Vírus aumenta após o **15º circuito**

---

## 🔋 Power-ups

Ganhe **1 power-up aleatório** a cada **5 circuitos** (30 pts).

| Tecla | Power-up | Efeito | Duração |
|---|---|---|---|
| `1` | ⚔ **SWORD** | Qualquer tecla de coluna/espaço conta como acerto | 15s |
| `2` | 🛡 **SHIELD** | Erros não acumulam no contador de consecutivos | 15s |
| `3` | ⚡ **OVERCLOCK** | Slow motion — tudo cai a 50% da velocidade | 15s |

---

## 🕹️ Modos de Jogo

Na tela inicial, escolha o número de colunas:

| Modo | Colunas | Teclas |
|---|---|---|
| **4 Colunas** | Z, X, C, V | Menos faixas, mais espaçadas |
| **5 Colunas** | Z, X, C, V, B | Desafio completo (padrão) |

---

## 🏆 Ranking Final

| Rank | Condição |
|---|---|
| **S** | Zero quebras de circuito |
| **A** | 1–2 quebras |
| **B** | 3–5 quebras |
| **C** | Mais de 5 quebras |

---

## 📁 Estrutura do Projeto

```
neural-override/
├── index.html          # Shell principal (3 telas: Start, Game, End)
├── css/
│   └── style.css       # Estética cyberpunk, HUD, animações, scanlines, pause overlay
└── js/
    ├── ui.js           # DOM: score, circuitos, integridade (4 slots), chuva digital
    ├── input.js        # Handler de teclado (anti-repeat, ignora modificadores sozinhos)
    ├── powerups.js     # Estado: Sword / Shield / Overclock (15s cada)
    ├── spawn.js        # Factory de blocos, zona de captura (+20%), hasPassedCaptureBottom
    └── game.js         # Loop principal, canvas, áudio Web API, lógica completa
```

---

## 🔊 Áudio

Gerado em tempo real via **Web Audio API** — sem arquivos de som:

- **Drone sintetizado** contínuo (sawtooth, 3 osciladores) com pitch proporcional à velocidade
- **Ping digital** no acerto
- **Noise burst** no erro
- **Rumble grave** na quebra de circuito
- **Arpejo ascendente** ao ativar power-up

---

## 🚀 Como Executar

Abra o `index.html` em qualquer navegador moderno — **sem servidor ou dependências necessários**.

```bash
# Ou use um servidor local simples:
npx serve .
```

### GitHub Pages

1. Push da pasta `neural-override/` para um repositório
2. Ative **Pages** em `Settings → Pages → Deploy from branch: main`
3. Acesse em `https://<usuario>.github.io/<repo>/`

> Totalmente estático — única dependência externa é o Google Fonts (carregado via CDN).

---

## 🛠️ Tecnologias

- **HTML5 Canvas** — renderização principal via `requestAnimationFrame`
- **Web Audio API** — engine de áudio procedural (sem arquivos)
- **CSS3** — neon glow, scanlines, glitch, pause overlay, glassmorphism
- **JavaScript ES6** — módulos IIFE sem bundler

---

*Desenvolvido como experiência de invasão digital progressiva.*
