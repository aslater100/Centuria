/**
 * In-game wiki panel showing game mechanics, resources, buildings, and tips.
 * Accessible from the main HUD and provides context-aware help.
 */

interface WikiSection {
  id: string;
  title: string;
  icon: string;
  articles: WikiArticle[];
}

interface WikiArticle {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

const WIKI_SECTIONS: WikiSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🎯',
    articles: [
      {
        id: 'basics',
        title: 'Game Basics',
        content: `<strong>Centuria</strong> is a deep-simulation 4X game. You take a single frontier settlement in
        <strong>1919</strong> and grow it across a full century — into a proclaimed nation, an economy, and a place in a
        living world of rival powers, all the way to <strong>2100</strong>.

        <strong>Key Concepts:</strong>
        • <em>Settlements</em> are your towns and cities — they grow population, produce goods, and pay taxes.
        • <em>The Nation</em> — once you proclaim statehood you govern with <em>legitimacy</em> (⚖), laws, and a treasury.
        • <em>Economy</em> — food (🌾), wood (🪵), and other goods flow through markets; your treasury funds it all.
        • <em>Research</em> unlocks new capabilities and steers which <em>era branch</em> your world grows into.
        • <em>The World</em> — rival nations expand, trade, and go to war around you. Crises and depressions hit everyone.
        • <em>Prestige</em> (★) — earned by building Wonders; the long-run mark of a great civilization.`,
        tags: ['basics', 'gameplay', '4x']
      },
      {
        id: 'tutorial',
        title: 'First Steps',
        content: `<strong>Step 1: Grow your settlement</strong> — keep food (🌾) ahead of population (👥) and watch
        happiness (☺). A fed, content town grows on its own.

        <strong>Step 2: Open the panels</strong> — press <em>E</em> for the Economy, <em>O</em> for the settlement
        Overview, and <em>T</em> for the Research tree. These are your main dashboards.

        <strong>Step 3: Research</strong> — the tech tree (<em>T</em>) unlocks buildings, institutions, and the path
        toward proclaiming a nation.

        <strong>Step 4: Proclaim a nation</strong> — once you qualify, becoming a state unlocks government, laws,
        taxation, and the Central Bank (<em>B</em>). Keep an eye on legitimacy (⚖) — it's your right to rule.

        <strong>Step 5: Expand & compete</strong> — settle new towns, open the Province view (<em>P</em>) and
        State/Government panel (<em>G</em>), and start building Wonders to earn prestige (★).

        <strong>Key Tip:</strong> Press <em>C</em> any time for the Century graph to see long-run trends.`,
        tags: ['tutorial', 'getting-started']
      }
    ]
  },
  {
    id: 'mechanics',
    title: 'Core Mechanics',
    icon: '⚙️',
    articles: [
      {
        id: 'nation-legitimacy',
        title: 'Nation & Legitimacy',
        content: `A colony becomes a <strong>nation</strong> when you proclaim statehood. From then on you rule with
        <strong>legitimacy</strong> (⚖ in the top bar) — the regime's right to rule.

        <strong>Legitimacy matters because:</strong>
        • Low legitimacy invites unrest, faction resistance, and instability.
        • Major reforms (e.g. extending suffrage) cost political capital and provoke the factions they threaten.
        • It's shown in the top bar once you're a nation and read in full in the State/Government panel (<em>G</em>).

        <strong>Tip:</strong> Reforms are powerful but destabilizing — time them for when legitimacy and happiness can
        absorb the shock, not during a crisis.`,
        tags: ['mechanics', 'nation', 'legitimacy']
      },
      {
        id: 'economy',
        title: 'Economy & Treasury',
        content: `Your <strong>treasury</strong> (top bar) funds everything. Settlements produce goods and, once you're a
        nation, pay taxes into it.

        <strong>Managing the economy:</strong>
        • Open the Economy panel (<em>E</em>) to see production, trade, and balances.
        • Food (🌾) and wood (🪵) are surfaced right in the top bar — keep them positive.
        • Set tax policy in the State/Government panel (<em>G</em>): too high crushes happiness, too low starves the treasury.
        • Once unlocked, the Central Bank (<em>B</em>) lets you manage money, credit, and interest.

        <strong>Living World Market</strong> (a World Dynamism option): with it on, goods obey supply and demand —
        shortages bite and gluts crash prices, so diversify what you produce.

        <strong>Tip:</strong> A running surplus is your buffer against the next crisis — don't spend to zero.`,
        tags: ['mechanics', 'economy', 'treasury']
      },
      {
        id: 'crises',
        title: 'Crises & Depressions',
        content: `The world is volatile. Economic <strong>depressions</strong> and other crises strike — a
        <span style="color:#ff8080">⚠ CRISIS</span> badge appears in the top bar when one is active.

        <strong>During a crisis:</strong>
        • Production, trade, and happiness come under pressure across the board.
        • You may be offered recovery choices — read the Nation panel for the details and trade-offs.
        • Higher difficulties (up to Brutal) raise crisis frequency and economic volatility, and squeeze pensions.

        <strong>Tip:</strong> Build slack in good years — a treasury cushion and a diverse economy are what carry you
        through a downturn. Watch happiness (☺); it's the early warning of trouble.`,
        tags: ['mechanics', 'crisis', 'economy']
      }
    ]
  },
  {
    id: 'prestige',
    title: 'Prestige & Wonders',
    icon: '⭐',
    articles: [
      {
        id: 'earning-prestige',
        title: 'How to Earn Prestige',
        content: `<strong>Prestige</strong> (★) is your civilization's crowning score. It is earned in exactly one way:
        <strong>completing a Wonder that you own</strong>.

        <strong>How it works:</strong>
        • Each Wonder is <em>unique</em> — only one of each can ever be built in the whole world. First to finish it
        claims it; rival nations actively race you for the highest-value ones.
        • When your nation completes a Wonder, its prestige value is added to your total. If a rival finishes it first,
        it's gone — you cannot build that Wonder anymore.
        • Prestige is <strong>never lost or reduced</strong> — it only ever goes up.
        • Your running total shows as ★ in the Economy → Wonders tab, and is reported in the Century Report.

        <strong>To earn prestige:</strong> prioritize the research and economy needed to build Wonders, and build them
        <em>before</em> a rival can. There is no other source of prestige — no per-building or per-battle trickle.`,
        tags: ['prestige', 'wonders', 'score']
      },
      {
        id: 'wonder-list',
        title: 'The Wonders',
        content: `Each Wonder grants a one-time burst of prestige (★) to whoever completes it first, plus an
        empire-wide bonus. Values:

        • <strong>The Great Granary</strong> — ★25
        • <strong>The Grand Bazaar</strong> — ★25
        • <strong>The Great Foundry</strong> — ★25
        • <strong>The Great Library</strong> — ★25
        • <strong>The Centuria Monument</strong> — ★50
        • <strong>The Space Program</strong> — ★40
        • <strong>The Satellite Network</strong> — ★45
        • <strong>The Orbital Station</strong> — ★60

        <strong>Tip:</strong> The later Wonders are worth the most — but they need a strong late-century economy and the
        right tech to reach. Plan your research so you arrive first.`,
        tags: ['prestige', 'wonders']
      }
    ]
  },
  {
    id: 'technology',
    title: 'Research & Eras',
    icon: '📚',
    articles: [
      {
        id: 'research',
        title: 'Research & Era Branches',
        content: `Open the <strong>Research tree</strong> with <em>T</em>. Technology unlocks new buildings, institutions,
        and the milestones that let you proclaim a nation and reach the Wonders.

        <strong>The century unfolds through eras.</strong> As the decades pass (1919 → 2100), the choices you make —
        especially around industry, climate, and governance — steer your world down an <strong>era branch</strong>: a
        greener <em>solarpunk</em> path, a corporate-dominated one, a flooded/climate-stressed world, and others. The
        branch reskins the world and shapes late-game challenges.

        <strong>World Dynamism — "A World That Fights Back":</strong> with this option on, a warming planet turns
        fossil-locked powers belligerent while green powers form coalitions — so your tech and climate choices ripple
        into diplomacy and war.

        <strong>Tip:</strong> Foundational techs that unlock whole categories pay off more than narrow one-offs. Use the
        Century graph (<em>C</em>) to see where your trajectory is heading.`,
        tags: ['research', 'technology', 'eras']
      }
    ]
  },
  {
    id: 'keybindings',
    title: 'Keybindings',
    icon: '⌨️',
    articles: [
      {
        id: 'keybindings-table',
        title: 'Keyboard Shortcuts',
        content: `<strong>General</strong>
        • <em>Space</em> — Pause / unpause
        • <em>1 / 2 / 3</em> — Game speed (1×/3×/8×)
        • <em>+ / −</em> — Zoom in/out
        • <em>Ctrl+S</em> — Quicksave
        • <em>Esc</em> — Pause menu

        <strong>Gameplay Panels</strong>
        • <em>T</em> — Toggle Research tree
        • <em>P</em> — Toggle Province view
        • <em>B</em> — Toggle Central Bank (once unlocked)
        • <em>E</em> — Toggle Economy panel
        • <em>G</em> — Toggle State/Government panel
        • <em>O</em> — Toggle Overview panel (the settlement inspector)
        • <em>C</em> — Open the century graph — long-run trends, any time
        • <em>? or H</em> — Toggle this help wiki

        <strong>Top bar (click, no keyboard needed):</strong>
        • <em>Speed cell</em> — click it to expand pause / 1× / 3× / 8× buttons.
        • <em>☰ Menu button</em> — opens the game menu (Save / Load / Return to Menu), same as Esc.
        • <em>❓ Help</em> — opens this wiki.

        <strong>Minimap (bottom-right):</strong> click it to expand to a large map; click again to shrink it back.

        <strong>Tip:</strong> Shortcuts are ignored while typing in a text field (e.g. renaming a town).`,
        tags: ['keybindings', 'reference', 'controls']
      }
    ]
  },
  {
    id: 'tips',
    title: 'Pro Tips',
    icon: '💡',
    articles: [
      {
        id: 'early-game',
        title: 'Early Game (1919+)',
        content: `<strong>Your first decades:</strong>
        • Keep food (🌾) comfortably ahead of population (👥) so your settlement grows steadily.
        • Watch happiness (☺) — it drives growth and warns you before trouble.
        • Push the Research tree (<em>T</em>) toward the milestones that let you proclaim a nation.

        <strong>Priorities:</strong>
        1. Stable food surplus and rising population
        2. Research foundational tech
        3. Proclaim your nation once you qualify
        4. Set sensible tax policy (State/Government, <em>G</em>)
        5. Begin scouting a second settlement site`,
        tags: ['tips', 'strategy', 'early']
      },
      {
        id: 'mid-game',
        title: 'Mid Game Scaling',
        content: `<strong>Becoming a power:</strong>
        • Expand — new settlements widen your economy and tax base. Manage them via the Province view (<em>P</em>).
        • Once unlocked, use the Central Bank (<em>B</em>) to manage money and credit.
        • Keep a treasury surplus as a crisis buffer — depressions hit hard, especially on higher difficulty.

        <strong>The wider world:</strong>
        • Rival nations expand and compete. With World Dynamism on, climate and industry choices feed into diplomacy and war.
        • Start planning for Wonders — decide which prestige (★) targets you can reach before rivals do.`,
        tags: ['tips', 'strategy', 'mid']
      },
      {
        id: 'late-game',
        title: 'Late Game & Prestige',
        content: `<strong>The road to 2100:</strong>
        • Race for Wonders — they're your main source of prestige (★) and each is one-per-world, so arrive first.
        • Your research and climate choices lock in your world's era branch (solarpunk, corporate, drowned, and more).
        • Steer through late-century crises with a strong, diversified economy and a healthy treasury.

        <strong>Measuring success:</strong>
        • Prestige (★) is the crowning score — read it in Economy → Wonders and in the Century Report.
        • Use the Century graph (<em>C</em>) to judge your long-run trajectory and course-correct.
        • By 2100, aim for a stable, high-legitimacy nation with the Wonders to prove it.`,
        tags: ['tips', 'strategy', 'late', 'prestige']
      }
    ]
  }
];

export class WikiPanel {
  private container: HTMLElement;
  private visible: boolean = false;
  private currentSection: string = 'getting-started';
  private currentArticle: string = 'basics';

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'wiki-panel hidden';
    this.container.innerHTML = this.render();
    parent.appendChild(this.container);
    this.attachEventListeners();
  }

  private render(): string {
    const section = WIKI_SECTIONS.find(s => s.id === this.currentSection)!;
    const article = section.articles.find(a => a.id === this.currentArticle)!;

    return `
      <div class="wiki-header">
        <h2>📖 In-Game Wiki</h2>
        <button class="wiki-close" aria-label="Close wiki">✕</button>
      </div>

      <div class="wiki-content">
        <div class="wiki-sidebar">
          <div class="wiki-sections">
            ${WIKI_SECTIONS.map(s => `
              <button class="wiki-section-btn ${s.id === this.currentSection ? 'active' : ''}"
                      data-section="${s.id}">
                ${s.icon} ${s.title}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="wiki-main">
          <div class="wiki-articles">
            ${section.articles.map(a => `
              <button class="wiki-article-btn ${a.id === this.currentArticle ? 'active' : ''}"
                      data-article="${a.id}">
                ${a.title}
              </button>
            `).join('')}
          </div>

          <div class="wiki-article">
            <h3>${article.title}</h3>
            <div class="wiki-article-content">
              ${article.content}
            </div>
            <div class="wiki-tags">
              ${article.tags.map(tag => `<span class="wiki-tag">${tag}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    this.container.querySelectorAll('.wiki-close').forEach(btn => {
      btn.addEventListener('click', () => this.toggle());
    });

    this.container.querySelectorAll('.wiki-section-btn').forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        this.currentSection = (e.currentTarget as HTMLElement).getAttribute('data-section')!;
        this.currentArticle = WIKI_SECTIONS.find(s => s.id === this.currentSection)!.articles[0].id;
        this.refresh();
      });
    });

    this.container.querySelectorAll('.wiki-article-btn').forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        this.currentArticle = (e.currentTarget as HTMLElement).getAttribute('data-article')!;
        this.refresh();
      });
    });
  }

  private refresh(): void {
    this.container.innerHTML = this.render();
    this.attachEventListeners();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.classList.toggle('hidden', !this.visible);
  }

  show(): void {
    this.visible = true;
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.container.classList.add('hidden');
  }

  isVisible(): boolean {
    return this.visible;
  }
}
