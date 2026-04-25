# 🎮 Merge Balls × TikTok Live

A physics-based merge balls game (like Suika/Watermelon Game) with **TikTok Live gifting integration** — viewer gifts drop bonus balls into your game in real-time!

---

## 🚀 Quick Start

### 1. Install Node.js
Download from https://nodejs.org (LTS version recommended)

### 2. Install dependencies
Open a terminal in this folder and run:
```
npm install
```

### 3. Start the game server
```
npm start
```

### 4. Open the game
Open your browser and go to:
```
http://localhost:3000
```

---

## 🎵 TikTok Live Integration

1. **Start your TikTok Live stream** on your phone or PC
2. In the game, type your TikTok **@username** into the box on the left
3. Click **Connect**
4. Viewer gifts will now drop bonus balls automatically!

### Gift → Ball Level Mapping
| Diamonds   | Ball Level |
|------------|-----------|
| 1–4        | Lv 1 (DROP)    |
| 5–14       | Lv 2 (PEBBLE)  |
| 15–49      | Lv 3 (STONE)   |
| 50–199     | Lv 4 (CRYSTAL) |
| 200–999    | Lv 5 (BOULDER) |
| 1,000–4,999| Lv 6 (SPHERE)  |
| 5,000+     | Lv 7 (GLOBE)   |

### Viewer Chat Commands
- **`!drop`** — Any viewer can type this to drop a free Lv1 ball
- **New followers** automatically drop a Lv1 ball

---

## 🕹️ Controls

| Action        | Key / Input           |
|---------------|-----------------------|
| Aim           | Move mouse            |
| Drop ball     | Left click            |
| Quick aim     | ← → Arrow keys        |
| Drop          | Space bar             |

---

## 🎯 How to Play

1. **Drop balls** from the top of the container
2. When **two balls of the same level touch**, they **merge** into the next level
3. Keep merging to score big points — Lv8 MEGA ball = 8,000 pts!
4. **Game over** when balls stack above the red danger line
5. Viewer gifts drop bonus balls — they can save you OR make things chaotic!

---

## ⚠️ Troubleshooting

**"Could not connect. Is the user live?"**
→ You must be actively streaming on TikTok Live for the connection to work.

**"tiktok-live-connector not installed"**
→ Run `npm install` again in this folder.

**Can't open localhost:3000**
→ Make sure you ran `npm start` and see the startup message in the terminal.

**Balls behaving weirdly**
→ Refresh the page (F5). The physics engine resets on page load.

---

## 🏆 Ball Types

| Level | Name    | Points  |
|-------|---------|---------|
| 1     | DROP    | 10      |
| 2     | PEBBLE  | 30      |
| 3     | STONE   | 80      |
| 4     | CRYSTAL | 200     |
| 5     | BOULDER | 500     |
| 6     | SPHERE  | 1,200   |
| 7     | GLOBE   | 3,000   |
| 8 ★   | MEGA    | 8,000   |
