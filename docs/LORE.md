# CENTURIA — World Bible

**Version 0.2 — canon draft + settled design decisions (2026-07-02 lore session, round 2).**
Companion to `GDD.md`. This document is *lore canon*: the history of the world, its nations,
and their leaders across 1919–2100. Game data (`src/data/rival_nations.json`, `names.json`)
should converge on this document as the lore is wired in; where they conflict, this file wins
once a conflict is noticed and resolved.

**Design stance (settled in the 2026-07-02 lore session):**
- **Thinly-veiled Earth.** Nations are deliberate analogs of real powers; the century's events
  rhyme with real history (a 1929-style crash, a ~1939 second war, a cold war, a climate
  reckoning) but diverge wherever the player pushes.
- **World-first.** The continent and the Great War were designed first; every nation is derived
  from what the war did to it.
- **Succession lines.** Leaders are mortal. Each nation carries a designed sequence of leaders
  across the eras, so 2050 Vasterholm feels nothing like 1919 Vasterholm. (Mechanically, rivals
  today have one immortal leader — succession is a future feature this canon is written to feed.)
- **Lore bible + data.** Canon lives here; structured fields flow into `src/data/` as systems
  are ready to consume them.

---

## 1. The World

### 1.1 Eurycia, the Girdled Continent

The known world is **Eurycia**: one great continent shaped like a closing hand, its politics a
compression of Europe's. Its geography, west to east:

- **The Meridian Sea** — the western ocean. Beyond it lies **Columbria**, the offshore giant.
- **The Kalimeran coast** — a fretted western seaboard of harbors, home of the carrying trade.
- **The Auristelline lowlands** — rich farm country and old money, south of the rivers.
- **The Twin Rivers (the Vasser and the Holm)** — the industrial spine of the continent.
  Whoever holds both banks holds Eurycia's forge. Vasterholm is named for them; losing their
  west banks in 1918 is the wound its whole century is about.
- **The Karel Massif** — the central mountain wall. Karelia lives in its passes and has never
  been successfully invaded, a fact Karelians mention within five minutes of meeting anyone.
- **The Hollow Crown** — the vast eastern and southern territories of the dead **Sarethine
  Empire** (§1.2). In 1919 this is the largest ungoverned space in the world: imperial roads to
  nowhere, provincial capitals with no province, land offices with no empire behind the desk.
  **The player's valley is here.** So, eventually, is everyone else's ambition.
- **The Volgor steppe** — the cold northeast, granary and prison of the old order, now the
  furnace of the Revolution.
- **The Eastern Sea** — beyond it, the island empire of **Kessaria**, late to industry and in a
  hurry about it.

> **Procedural-map note:** the campaign map is procedurally generated, so this geography is
> *narrative* geography — it constrains flavor text, names, and who-hates-whom, never tile
> layouts. "Vasterholm is upriver of you" is a sentence for event text, not a map assertion.
> **One worldgen requirement it does impose (settled, round 2 — no off-map rivals):** the map
> must be large enough to seat all canon rivals as real map powers, with the far powers
> (Columbria, Kessaria) placed at distance and, where terrain allows, across water.

### 1.2 The Dead Empire: Sarethia

For four hundred years the **Sarethine Empire** — crown and church fused, a double-headed
eagle over half of Eurycia — was the world's idea of permanence. It entered the Great War to
discipline its secessionists and instead dissolved: the front collapsed in 1917, the Emperor
abdicated to a hotel in Karelia, and the imperial administration simply *stopped*, province by
province, like lights going out down a corridor.

Sarethia is the world's dead predecessor. It exists in 1919 only as:

- **The Hollow Crown** — its ungoverned lands, open to homesteaders, chartered companies, and
  eventually armies. The player's colony is legally squatting on Sarethine land to which no
  living authority holds title.
- **Tyrennia** — the imperial *church*, which survived the crown it was fused to and seized the
  old ecclesiastical heartland as a state (§3.3).
- **Names and ruins.** Imperial mile-posts, abandoned rail spurs, land-registry paper that
  half the continent's lawyers will spend the century arguing about. When the game needs an
  old fort, a disputed deed, a ghost town, or a claim of ancient right — it's Sarethine.

### 1.3 The Great War, 1908–1918

The war that opens the game's world ran ten years and killed the old order. The short version
every settler in 1919 knows:

- **How it started (1908):** Vasterholm, the rising industrial monarchy of the Twin Rivers,
  challenged the encirclement built around it by Auristelle (the old land power) and Kalimera
  (the naval-commercial power). A border incident on the Vasser did what border incidents do.
- **The sides:** the **River Compact** (Vasterholm, Sarethia, and Kessaria opportunistically in
  the east) against the **Concordat** (Auristelle, Kalimera, Volgoria — and, from 1916,
  Columbria's money and matériel, then its men).
- **The middle:** Karelia armed its passes, declared neutrality, and banked everyone's gold.
- **The turning (1916–17):** Volgoria's armies mutinied; the **Volgor Revolution** pulled it
  out of the war and gave the century its second pole of ideology. Sarethia collapsed outright.
  Columbria's entry replaced the exhausted eastern ally with a fresh western one.
- **The end (1918):** Vasterholm, alone and starving, signed the armistice.
- **The peace — the Treaty of Meridienne (1919):** written in Auristelle's image and remembered
  by everyone as either justice or theft. Vasterholm lost the west banks of the Twin Rivers,
  its fleet, and forty years of reparations. The Sarethine succession was left deliberately
  unresolved — the victors could not agree on how to divide the Hollow Crown, so they divided
  it from nobody, and the greatest land rush of the century began.

**Why this matters to the player:** the campaign's opening move — a wagon column founding a
colony in an empty, fertile valley in 1919 — is only possible *because* of this history. The
land is empty because an empire died; it is contested later because the treaty never settled
who inherits it; the rivals who arrive are the war's survivors acting exactly in character.

### 1.4 The Founding Column (the player's origin)

**Settled (round 2): founding stories are player-selectable at new game, with light mechanical
seasoning.** Three origins, all walking into the Hollow Crown in 1919:

| Origin | Who they are | Mechanical seasoning (light) |
|---|---|---|
| **The Veterans' Column** *(default)* | Demobilized soldiers and war refugees from every belligerent | + starting militia/warrior strength; faster raid recovery |
| **The Chartered Expedition** | A Kalimeran-style trading charter opening the interior for profit | + starting treasury; early trade-route affinity; the charter's shareholders as a recurring event voice |
| **The Covenant of the Meek** | A dissident congregation fleeing the post-war order to build its model society | + cohesion/mood resilience; ideology starts coherent (low spread); friction events when the world intrudes |

Each origin changes founding narration, early event text, and eventually its own flavor of
Notable backstories. Seasoning must stay *light* — a nudge, not a build; the spine
(Town → State → Nation) is identical for all three.

The **Veterans' Column** remains the canonical default and the origin all era-neutral lore
assumes — a mixed column
from every belligerent, walking into the Hollow Crown under no flag. Ex-Compact gunners beside
ex-Concordat sappers; a Sarethine land-clerk who kept the registry books; farm families whose
farms are now a border. What they share is the one conviction of 1919: *never again someone
else's war* — and the discovery, over the next 181 years, of how hard that is to keep.

This explains, in fiction, several existing mechanics:

- **The mixed name pool** (`names.json`): the column has no single nationality. (Future work:
  per-nation name pools for *rival* notables, keeping the player's pool deliberately mixed.)
- **The Tier-1 "no formal government" start**: the column governs by veterans'-committee
  informality — which is exactly the "Growing Pains" ceiling that forces incorporation.
- **The Constitutional Convention** at Proclamation: the moment the column's children finally
  answer the question the founders deferred — *what were we, all along?*

The other two origins answer the same three questions differently: the Expedition's name pool
skews Kalimeran and its deferred question is *who does the charter serve once it's a country*;
the Covenant's names are scriptural-plain and its deferred question is *what happens to a
church that becomes a state* (a small, pointed echo of Tyrennia's answer).

---

## 2. Timeline of the Century (the world's default script)

The rhyme-scheme with real history, as it unfolds **if the player never interferes**.

**Settled (round 2): how hard these beats push is a player-set dial** — a new-game
**Historical Fidelity** option (precedent: the shipped World Dynamism toggles, which are
serialized campaign options):

- **Sandbox** — no scripted beats; the sim's own dynamics (crash cycles, rival AI, climate)
  are merely *tuned* so the century tends to rhyme. Any run can diverge completely.
- **Rhyming** *(default)* — major beats (the Slump, the second war, Volgoria's collapse) fire
  as events in a loose window **unless world-state already contradicts them**; the player can
  dampen or dodge, not toggle off.
- **Guided** — beats fire on schedule and hit hard; the century is a story you live through.
  Best first-campaign experience; the alt-history sandbox is what you unlock by mastering it.

| Years | Beat | Real-world rhyme |
|---|---|---|
| 1919 | Treaty of Meridienne; the land rush into the Hollow Crown begins | Versailles / post-Ottoman mandates |
| 1919–1928 | The Brittle Decade: Vasterholm's republic wobbles under reparations; Volgoria consolidates its revolution; Kalimera booms on the carrying trade | Weimar, NEP, the Roaring Twenties |
| 1929–1934 | **The Great Slump**: a Columbrian credit collapse goes worldwide | 1929 |
| 1933 | Von Stahl's movement takes Vasterholm; the republic votes itself out of existence | 1933 |
| 1938–1946 | **The Second Great War**: Vasterholm's revenge on Auristelle; Kessaria strikes across the Eastern Sea; Columbria decides it late | 1939–45 |
| 1947–1989 | **The Long Watch**: Columbria vs. Volgoria, a two-pole cold war fought in trade blocs, proxies, and the Hollow Crown's successor states — the player's nation being the biggest prize | Cold War |
| ~1969 | The Space Race peaks (already in-game as the wonder race) | Apollo |
| 1989–1995 | Volgoria's system exhausts itself; reform or fragmentation | 1989–91 |
| 1995–2040 | The Networked Boom, then the **Climate Reckoning**: the Twin Rivers flood, the Kalimeran coast drowns by inches, the steppe dries | our present, projected |
| 2040–2100 | The Long Repair or the Long Decline — the sim's climate/economy endgame decides which; the 2100 Century Report is the world's verdict | speculative |

---

## 3. Nation Dossiers

Each dossier: analog · war record · character · **succession line** (the designed leaders of
the century, era by era) · grudges · hooks into existing mechanics. The four nations already in
`rival_nations.json` come first; the four new powers follow. AI-personality numbers stay in the
JSON; this file owns the *why* behind them.

### 3.1 Vasterholm — the Wounded Forge

*Analog: Germany. Archetype: hegemon. Regime arc: fragile republic → one-party state →
partition → reunified federal power.*

The industrial monarchy of the Twin Rivers, defeated, humiliated at Meridienne, and certain to
the marrow that the verdict was a lie. Vasterholm is the best engineer and the worst loser on
the continent. Its century is one long argument between its two souls: the workshop and the
barracks.

**Succession line:**
1. **Chancellor Aldric von Stahl** (in power 1933–1946) — *the current JSON leader.* A
   decorated Vasser-front colonel turned movement politician; took the chancellery legally and
   never gave it back. Charming in small rooms, catastrophic in large ones. Launches the Second
   Great War to retake the west banks; ends it in a bunker under the Holm.
   *(Pre-Stahl republic, 1919–33: President **Emil Hartwig**, a decent doomed social democrat —
   the leader the player actually meets at game start if succession is ever wired in.)*
2. **Chancellor Greta Lindow** (1946–1961) — the reconstruction chancellor; a former resistance
   printer. Signs the reparations-for-reintegration accords; mother of the "Vasser miracle."
3. **Chancellor Otto Brandt-Weiss** (1961–1988) — technocrat of the Long Watch; plays Columbria
   and Volgoria against each other and industrializes the moon-race supply chain.
4. **Chancellor Sofie von Stahl** (2019–2040) — the great-granddaughter, name and all; a
   climate-hawk conservative who dams the Twin Rivers against the floods and half-bankrupts the
   federation doing it. Whether she's redemption or recurrence is the century's open question.

**Grudges:** Auristelle (author of Meridienne — permanent), Kalimera (the blockade — fading),
the player (only if you hold former river territories or beat them in a war — feeds the
existing revanchism mechanic perfectly: *"they have not forgiven their defeat"*).

### 3.2 Kalimera — the Ledger and the Wave

*Analog: Britain, with Venetian salt. Archetype: trading_republic. Regime: merchant republic
throughout — the constitution bends, never breaks.*

Victor of the Great War and nearly ruined by winning it. Kalimera's empire is not land but
*paper*: charters, insurance, shipping lanes, and the continent's reserve currency. Its
strategy for two centuries has been the same three words: **balance the continent** — fund
whoever is second to fight whoever is first.

**Succession line:**
1. **President Maren Costa** (1912–1931) — *the current JSON leader.* The war president; held
   the blockade line and the credit line simultaneously. Retires to write self-serving memoirs
   that are, annoyingly, mostly accurate.
2. **President Aurelio Vann** (1931–1938) — the appeaser; extends von Stahl credit in the name
   of trade and is remembered for nothing else.
3. **President Livia Marchetti** (1938–1952) — the war-and-decolonization president; wins the
   second war and loses the carrying-trade monopoly in the same decade.
4. **President Corin Adessi** (1989–2011) — reinvents Kalimera as the world's financial
   clearing-house after Volgoria's fall; deregulates with both hands; the 2008-rhyme crash is
   his legacy's asterisk.
5. **President Nadia Costa-Reyes** (2044–2062) — Maren's descendant; president of the drowned
   coast, who moves the capital uphill and makes sea-walls the new shipping lanes.

**Grudges:** none held longer than they're profitable. Kalimera's diplomatic personality
(high commerce, high honor, low grudge in the JSON) is canon: it keeps its word and its
invoices with equal rigor.

### 3.3 Tyrennia — the Church That Outlived Its Crown

*Analog: the Sarethine (Austria-Hungary + Vatican fusion) clerical rump. Archetype:
crusader_state. Regime: theocracy → late-century reformation or collapse.*

When the Sarethine Empire dissolved, its church did not. The **Tyrennine Congregation** — the
imperial faith's governing order — seized the old ecclesiastical heartland, declared the
Emperor's abdication a spiritual event ("the crown has passed to the altar"), and built the
century's most disciplined ideological state. Tyrennia claims, quietly and permanently, to be
the *legitimate successor of all Sarethine lands* — which includes, awkwardly, the player's
valley. Its weapon is rarely the army; it is the seminary, the printing press, the mission
school in your third town.

**Succession line:**
1. **Supreme Prelate Oswyn Brennan** (1917–1944) — *the current JSON leader.* The
   architect-of-the-rump; a Sarethine court chaplain who watched the empire die and concluded
   that faith failed only because it shared power. Uncompromising, incorruptible, terrifying.
2. **Supreme Prelate Casimir Voss** (1944–1972) — the cold-war prelate; exports doctrine into
   the Hollow Crown's new states as Volgoria exports revolution — the two missionary systems of
   the Long Watch, mirror images that despise each other.
3. **Supreme Prelate Ilona Marek** (1998–2031) — the first woman elevated; the reformer. Opens
   the archives, apologizes for the mission schools, and triggers the schism between the
   Reconciled and the Sedevacant that defines late-century Tyrennia.
4. **The Interregnum** (2031–?) — whether Tyrennia ends the century as a reconciled small state
   or a hollowed-out theocratic museum is left to the sim.

**Grudges:** Volgoria (the anti-faith — doctrinal, eternal), the player (doctrinal claim on
your land — softens only if you tolerate its missions; hooks the existing culturalInfluence
bonus and ideology-pressure mechanics).

### 3.4 Karelia — the Locked Door

*Analog: Switzerland with Scandinavian temperament. Archetype: hermit_kingdom. Regime:
constitutional monarchy, continuously, smugly, throughout.*

The mountain confederation that has never lost a war because it has never fought one it didn't
host. Armed neutrality, universal militia, numbered accounts. Karelia banked the Great War's
gold, both sides' — and the deposits nobody came back to claim are the quiet foundation of its
century. Its foreign policy is a locked door with a mail slot.

**Succession line** (kings reign, Minister-Presidents govern):
1. **Minister-President Torsten Skau** (1910–1934) — *the current JSON leader.* The neutrality
   architect; wrote the militia statutes and the banking secrecy law in the same decade, and
   considered them the same law.
2. **Minister-President Astrid Kaarby** (1934–1949) — neutrality's hardest test; interned
   aircrews of both sides with identical courtesy and identical fences.
3. **Minister-President Henrik Dahl-Skau** (1972–1990) — the grandson; drags Karelia into the
   networked age — the mountain vaults become data vaults.
4. **Minister-President Marit Onstad** (2035–2055) — the climate-era premier; the passes are
   now the continent's water tower, and Karelia discovers what it's like to own the one
   resource everyone will fight for. The hermit kingdom's first genuinely dangerous century.

**Grudges:** none. Fear of entanglement is the national personality (the JSON's isolation
agenda + high tableCost is canon: *difficult to approach*).

### 3.5 Volgoria — the Furnace of the Revolution *(NEW)*

*Analog: Russia/USSR. Archetype: ideological superpower (suggested new archetype or
`hegemon` variant). Regime arc: revolutionary committee → one-party state → reform →
fragmentation or reinvention.*

The steppe empire that broke first. Volgoria's armies mutinied in 1916, its winter palaces
burned in 1917, and by 1919 the **Volgor Workers' Concord** governs the largest country on the
continent with the youngest ruling class in the world. Volgoria is the second pole of the
century: everything Tyrennia preaches inverted, everything Columbria sells nationalized. It
feeds the game's economic-left ideology axis the way Tyrennia feeds the authority axis.

**Succession line:**
1. **First Delegate Arkady Solov** (1917–1935) — the revolution's chairman; a railway
   engineer who organized the mutiny timetable and then the state on the same principles.
   Dies at his desk; the struggle to succeed him is the first purge.
2. **First Delegate Vera Malenkova** (1935–1958) — the iron delegate; industrializes the
   steppe at ruinous human cost, wins the Second Great War's eastern front, and builds the
   police state that outlives her by thirty years.
3. **First Delegate Yuri Ostrov** (1958–1974) — the thaw; space-race patron (the in-game
   wonder race is his budget line), crushes the Prelate's missions abroad and the reformers at
   home with the same apparatus.
4. **First Delegate Katarin Solova** (1985–1996) — the reformer who finds the books were
   cooked all along; presides over the system's exhaustion. Whether Volgoria fragments,
   reforms, or reddens again after 1996 is left to the sim's regime mechanics.

**Grudges:** Tyrennia (doctrinal, mutual, eternal), Columbria (the pole opposite), Vasterholm
(1938–46, then a wary partnership of pariahs), the player (purely ideological — tracks your
economy axis: a workers' republic next door is a brother; a corporate state is a target).

### 3.6 Auristelle — the Vindictive Victor *(NEW)*

*Analog: France. Archetype: prestige power (suggested: `hegemon` variant with high honor/high
grudge). Regime: republic, gloriously unstable — more constitutions than any two neighbors
combined.*

The old land power of the southern lowlands: the continent's museum, vineyard, and academy,
and the author of the Treaty of Meridienne. Auristelle won the Great War at a cost that
hollowed a generation, and wrote a peace designed to make sure of Vasterholm forever — which
made sure of the opposite. Its century is a long, stylish argument with its own decline.

**Succession line:**
1. **Premier Honoré Vasseur** (1917–1927) — "the Tiger of Meridienne"; wrote the treaty,
   demanded the river banks, and told the doubters: *"we have not made peace, we have made a
   twenty-year armistice."* Hated being right.
2. **Premier Céleste Aubrion** (1936–1940) — the last premier of the old republic; falls with
   the lowlands in the second war's terrible spring.
3. **General-President Marc Delorme** (1944–1965) — the liberator-general; founds the new
   republic around his own spine, exits the Columbrian alliance structure just to prove he
   can, and gives Auristelle its bomb and its ego back.
4. **Premier Elise Vasseur-Kahn** (2020–2038) — the Tiger's descendant; the climate-treaty
   premier who tries to do to carbon what her ancestor did to Vasterholm — a punitive settlement
   — and learns the same lesson.

**Grudges:** Vasterholm (defining, mutual, the century's axis), Kalimera (allies who invoice
each other), the player (only over prestige — Auristelle cannot bear being third).

### 3.7 Columbria — the Distant Engine *(NEW)*

*Analog: USA. Archetype: offshore superpower. Regime: presidential republic throughout.*

Across the Meridian Sea: a continent-sized republic of settlers, factories, and creditors that
would very much prefer Eurycia be somebody else's problem. Columbria enters both great wars
late and decides both; spends the Long Watch as one of its two poles; and owns the crash of
1929, the boom of the '90s, and a good share of the carbon in the sky. **Design note
(settled, round 2): no off-map rivals — Columbria is a full map rival, and the map expands to
fit it.** Worldgen places it far from the player's start (the "across the sea" of the lore
becomes literal distance/water on the procedural map where possible); its personality does the
rest — low early expansion toward the player, overwhelming economy, late decisive entry into
wars. The existing off-map world-demand machinery remains for *flavor-only* far powers, not
for any of the eight canon nations.

**Succession line** (presidents, term-limited — the line is long; these are the ones event
text needs):
1. **President Warren Cole** (1913–1921) — brought Columbria into the Great War in 1916 and
   the peace conference in 1919; his League-of-Nations rhyme dies in his own senate.
2. **President Josiah Marsh** (1929–1933) — the crash president; a name spoken in eight
   languages wherever men are unemployed.
3. **President Eleanor Voss** (1933–1945) — the New Deal rhyme and the second war's arsenal;
   the leader every mid-century event quotes.
4. **President Dean Calloway** (1981–1989) — the Long Watch's closing salesman; outspends
   Volgoria into exhaustion.
5. **President Amara Okafor-Bell** (2033–2041) — the reckoning president; signs the Meridian
   Climate Accords with Vasseur-Kahn and argues about who pays, forever.

**Grudges:** Volgoria (the pole opposite), Kessaria (1938–46, then the strangest friendship of
the century), the player (none by default — Columbria's lever is the market, not the map).

### 3.8 Kessaria — the Rising Sun of the Eastern Sea *(NEW)*

*Analog: Japan. Archetype: late-industrializing island empire (suggested: `opportunist` early,
`trading_republic` late). Regime arc: militarist empire → occupied → pacifist trading state.
**Design note (settled, round 2): full map rival** — worldgen seats it on a coast or island
group at the map's eastern reach where terrain allows; where it doesn't, distance stands in
for the sea and the island-empire flavor lives in event text.*

The island chain beyond the Eastern Sea that watched Eurycia industrialize and decided to do
it in one generation. Kessaria joined the Great War on the Compact side purely for Sarethia's
eastern ports, kept them at Meridienne, and concluded that empire is simply what industrial
nations do. Resource-hungry and treaty-cynical, it strikes across the Eastern Sea in 1941
(the second war's second front) — and after defeat and occupation performs the century's most
astonishing costume change: the militarist empire reborn as the trading state par excellence,
out-Kalimera-ing Kalimera by 1980.

**Succession line:**
1. **Marshal-Regent Ryo Katsuo** (1926–1945) — the militarist ascendancy; the strike across
   the Eastern Sea is his doctrine's masterpiece and epitaph.
2. **Prime Minister Sato Ishiro** (1948–1960) — the reconstruction premier under Columbrian
   occupation; signs the pacifist charter and means it.
3. **Prime Minister Kenji Aoyama** (1972–1984) — the miracle years; Kessarian electronics in
   every Eurycian home (hooks the existing electronics/consumer-goods supply-chain systems).
4. **Prime Minister Hana Katsuo-Mori** (2028–2044) — the marshal's descendant; premier of the
   aging archipelago, first to run a nation on a shrinking population — the demographic future
   everyone else's cohort matrix is heading toward.

**Grudges:** Volgoria (the northern islands, never returned), Columbria (defeat, transmuted
into alliance), the player (commercial rivalry only — unless you hold the eastern coast).

---

## 4. The Pretender in Karelia (event-chain design sketch)

**Settled (round 2): Sarethia gets a full restorationist event chain.** The dead empire's heir
is the century's best recurring guest star, and the chain gives the Hollow Crown's landlords —
including the player — a running legitimacy problem money can't settle.

**The premise.** The Emperor abdicated to a Karelian hotel in 1917 and died there in 1924; the
line continues through his grandchild, the **Archduke Valentin Sarethis**, raised in exile on
Karelian courtesy and Tyrennine tutors. Karelia shelters the household (neutrality plus old
deposits); Tyrennia maintains, delicately, that the crown passed to the altar — so a living
claimant is as awkward for the Prelate as for everyone squatting on imperial land.

**The chain, in five movements** (windows assume the Rhyming fidelity setting; Sandbox lets
world-state trigger them, Guided pins them):

1. **The Manifesto (mid-1920s).** Pamphlets appear in every settlement on former Sarethine
   land — the player's towns qualify — asserting the Archduke's title to it. Small ideology
   nudge toward authority among older cohorts; a Notable may declare as a loyalist.
2. **The Courtship (1930s).** Powers bid for the claim: von Stahl's Vasterholm offers to
   "restore" Valentin as a client; Tyrennia offers recognition-for-renunciation. The player is
   approached too — host the court-in-exile (prestige + Tyrennia/Volgoria friction), extradite
   an agitating loyalist to a bidder (relations + ideology backlash), or shut the door
   (Karelia's respect, quietly).
3. **The Rising (second-war years).** Somewhere in the Hollow Crown a restorationist rising
   seizes a provincial town under the double eagle. If it's in your territory it's your civil
   emergency; if a rival crushes it, the refugees walk to you.
4. **The Long Suit (Long Watch).** The claim dwindles into the century's most fascinating
   court case — the land-registry paper of §1.2 finally litigated. Periodic events: a deed
   your third town sits on surfaces in a Karelian vault; settling (buy the quiet title) vs.
   defying (unrest among loyalist cohorts, Tyrennia tuts).
5. **The Renunciation (or the Museum) (1990s+).** The last Sarethis heir either renounces —
   a continent-wide closure event, prestige to whoever hosted the signing — or dies claimant,
   leaving a "Pretender's Museum" wonder-lite in whichever nation holds the relics.

**Mechanical seams it can reuse today:** the event system, Notables (loyalist ministers,
declared sympathizers), ideology distributions (authority-axis nudges), diplomacy relations,
and prestige. **New state it would need** (succession of the claimant, chain progress) is
serialized → hard-stop approval before implementation, like all §6 items.

---

## 5. Naming & Culture Notes (for name pools and event text)

Per-nation flavor for future per-nation name pools (rival notables, generals, ministers) and
for event-text writers. The player's own pool stays deliberately mixed (§1.4).

| Nation | Naming flavor | Texture keywords |
|---|---|---|
| Vasterholm | Germanic-Nordic (Aldric, Greta, von Stahl, Brandt) | rivers, steel, precision, grievance |
| Kalimera | Italo-Iberian coastal (Maren, Livia, Costa, Adessi) | salt, ledgers, marble exchanges, weather-luck |
| Tyrennia | Latinized-Slavic clerical (Oswyn, Casimir, Voss, Marek) | bells, archives, incense, patient certainty |
| Karelia | Nordic (Torsten, Astrid, Skau, Onstad) | granite, snowmelt, vaults, courtesy |
| Volgoria | Slavic (Arkady, Vera, Solov, Ostrov) | steppe wind, rail timetables, red banners, frost |
| Auristelle | French (Honoré, Céleste, Vasseur, Delorme) | vineyards, salons, artillery, glory |
| Columbria | Anglo-American melting-pot (Warren, Eleanor, Marsh, Okafor-Bell) | distance, credit, radio, plenty |
| Kessaria | Japanese-inflected (Ryo, Hana, Katsuo, Aoyama) | tides, paper, discipline, reinvention |
| Sarethia (dead) | Ornate imperial compound names — used for ruins, deeds, old forts | double eagles, dust, unresolved paperwork |

---

## 6. Wiring Plan (lore → game data, future work)

Nothing below is implemented by this document; it is the roadmap for converging data on canon.
Ordered by payoff-per-effort:

1. **Deepen the existing 4 rivals' JSON** — replace the one-paragraph `description` with
   canon-derived text; add a non-mechanical `lore` field (war record, grudge summary, treaty
   stance) surfaced in the diplomacy panel. No schema risk if additive + optional.
2. **Add the 4 new nations** to `rival_nations.json` — **all four as full map rivals** (no
   off-map powers, settled round 2). Prerequisite: **worldgen sizing** — the map must scale to
   seat 8 rivals, with Columbria/Kessaria placed at distance (across water where terrain
   allows). *Balance-affecting — needs its own session and headless A/B.*
3. **Per-nation name pools** — extend `names.json` (or a sibling file) with per-nation pools
   keyed by faction id, used when minting rival notables/generals; player pool unchanged
   (mixed by canon — with Expedition/Covenant origin skews per §1.4 once origins land).
4. **Selectable founding origins** (§1.4) — new-game choice of three origins with light
   mechanical seasoning + origin-keyed founding narration and early events. Likely a
   serialized campaign option (precedent: World Dynamism toggles) → **hard-stop approval**.
5. **Historical Fidelity dial** (§2) — Sandbox / Rhyming *(default)* / Guided as a serialized
   new-game option gating the beat-event layer → **hard-stop approval**. Ship the dial with,
   or before, the first beat events; Sandbox must equal today's behavior byte-for-byte.
6. **Succession events** — leaders age and die on the canon schedule; a succession fires a
   diplomacy event and swaps the personality weights toward the successor's profile. This is
   the big one (new serialized state → **hard-stop approval required**), and the succession
   lines above are written to be its content.
7. **Historical beat events** — the §2 timeline as the event layer behind the fidelity dial
   (the Slump, the second war, the Long Watch). Design carefully against determinism
   guarantees.
8. **The Pretender chain** (§4) — after succession events exist (the claimant is himself a
   succession line); new serialized chain state → **hard-stop approval**.
9. **Sarethine flavor layer** — ruins/deeds/ghost-town event text drawing on §1.2; pure
   flavor, zero mechanics. Can ship any time.

---

## 7. Decision Log & Open Questions

**Settled — round 1 (2026-07-02):** thinly-veiled Earth · world-first design · succession
lines over immortal leaders · lore bible + data convergence.

**Settled — round 2 (2026-07-02):**
- **Founding origins:** selectable at new game (Veterans' Column default / Chartered
  Expedition / Covenant of the Meek), each with *light* mechanical seasoning (§1.4).
- **No off-map rivals:** Columbria and Kessaria are full map rivals; **the map expands to fit
  the roster** (§1.1 note, §3.7, §3.8).
- **Timeline beats:** player-set **Historical Fidelity** dial — Sandbox / Rhyming (default) /
  Guided (§2).
- **The Pretender in Karelia:** yes, a full event chain (§4).

**Still open:**
- Worldgen specifics for the 8-rival map: how much bigger, water generation guarantees, and
  what "distance stands in for the sea" means in tiles.
- Origin seasoning exact numbers (must stay a nudge, not a build) — balance session.
- Whether Guided fidelity should be the suggested first-campaign default in the new-game UI,
  or merely offered.
- Post-1996 Volgoria and post-2031 Tyrennia: the sim decides today; do late-century scripted
  forks ever exist at Guided fidelity?
