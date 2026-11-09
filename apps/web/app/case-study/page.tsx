import { PageHero, JsonLd, breadcrumbs, pageMetadata, ORGANIZATION_ID } from "@/site/ui"; // SEO component
import { SITE_URL } from "@/site/content"; // SEO component

const DESCRIPTION = // SEO component
  "Ten recent crypto losses where attackers took control instead of breaking code: Binance, Humanity Protocol, Wasabi, KelpDAO, Drift, Resolv, Step Finance, SwissBorg, Bybit and Radiant. What happened, what failed, and what onchain monitoring can and cannot see."; // SEO component
export const metadata = pageMetadata({
  title: "Case studies: ten control attacks",
  description: DESCRIPTION,
  path: "/case-study",
}); // SEO component

/** One incident. Figures are as reported at the time and often differ between sources, so ranges are kept. */
interface Attack {
  id: string;
  name: string;
  date: string;
  where: string;
  loss: string;
  happened: string;
  failed: string;
  overwatch: string;
  sources: [label: string, url: string][];
}

// Newest first. Every claim here comes from the linked sources; nothing is inferred beyond them.
const ATTACKS: Attack[] = [
  {
    id: "binance",
    name: "Binance",
    date: "October 29, 2026",
    where: "Centralized exchange, ten blockchains",
    loss: "about $6.3B",
    happened:
      "Attackers drained Binance hot wallets on ten blockchains, most of it in about 20 minutes. Binance's first finding was a compromised DevOps engineer's laptop that reached a service able to submit withdrawals. It found no evidence that a wallet private key leaked, and later said there were more breach points than that one machine. The FBI attributed the theft to North Korea's TraderTraitor group. A large share was frozen in the days after.",
    failed:
      "The signing system itself. The keys never left; an attacker who could reach the system that uses them could get any withdrawal signed.",
    overwatch:
      "Nothing. An exchange's internal signing happens off-chain and is outside what Overwatch reads. The lesson for protocols: ask what your signing pipeline will approve, not only who holds the keys.",
    sources: [
      [
        "TechCrunch",
        "https://techcrunch.com/2026/10/29/binance-pauses-withdrawals-as-hackers-suspected-of-stealing-billions-in-crypto/",
      ],
      [
        "BleepingComputer",
        "https://bleepingcomputer.com/news/security/binance-links-63-billion-crypto-theft-to-compromised-devops-laptop",
      ],
      [
        "TRM Labs",
        "https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history",
      ],
    ],
  },
  {
    id: "humanity",
    name: "Humanity Protocol",
    date: "June 2026",
    where: "Ethereum and BNB Chain",
    loss: "about $31M to $36M",
    happened:
      "Malware on one developer's computer gave the attackers root access. Three of the six owner keys of the Ethereum Safe and three of the five owner keys of the BNB Chain Safe could be recovered from that single machine. The attackers used them to take control of the token bridges, and the H token fell by roughly 85 to 90 percent.",
    failed:
      "A multisig whose keys were stored together. On paper several people had to agree; in practice one device held enough keys to act alone.",
    overwatch:
      "Onchain, the multisig looked healthy until it was used. Overwatch would have reported the change of control when it landed, not before. Where keys are backed up is invisible from the chain.",
    sources: [
      ["Rekt", "https://rekt.news/humanity-protocol-rekt"],
      ["Halborn", "https://www.halborn.com/blog/post/explained-the-humanity-protocol-hack-june-2026"],
      ["Cointelegraph", "https://www.cointelegraph.com/news/humanity-protocol-laptop-bridge-exploit-h-token"],
    ],
  },
  {
    id: "wasabi",
    name: "Wasabi Protocol",
    date: "April 30, 2026",
    where: "Ethereum, Base, Berachain and Blast",
    loss: "about $4.5M to $5M",
    happened:
      "Wasabi's deployer wallet was the only address holding ADMIN_ROLE. With that key the attacker granted admin to a helper contract, upgraded the perpetuals vaults and the LongPool to a malicious implementation, and drained them in about two hours. No multisig, timelock or vote stood in the way. How the key leaked has not been made public.",
    failed: "A single key with the power to upgrade the contracts that hold deposits.",
    overwatch:
      "This is the case Overwatch grades hardest. A single-key upgrade authority costs 60 points and marks a protocol red, so a Solana protocol set up this way would have been red long before anyone attacked it.",
    sources: [
      [
        "The Block",
        "https://www.theblock.co/post/399558/wasabi-protocol-hit-by-more-than-5-million-exploit-across-multiple-chains-security-firms-say",
      ],
      [
        "Hypernative",
        "https://www.hypernative.io/insights/blog/when-the-deployer-key-is-the-only-admin-how-one-compromised-wallet-drained-5m-from-wasabi-perp-across-three-chains",
      ],
      ["Halborn", "https://halborn.com/blog/post/explained-the-wasabi-protocol-hack-april-2026"],
    ],
  },
  {
    id: "kelpdao",
    name: "KelpDAO",
    date: "April 18, 2026",
    where: "Ethereum, via a LayerZero bridge to about 20 chains",
    loss: "about $292M (116,500 rsETH, roughly 18% of supply)",
    happened:
      "Kelp's rsETH bridge accepted a forged cross-chain message and released 116,500 rsETH. LayerZero says the attackers poisoned the RPC infrastructure used by Kelp's only verifier: the bridge was configured with one verifier (a 1-of-1 DVN), so one forged attestation was enough to authorise withdrawals. Kelp disputes the blame and points at LayerZero's defaults. The emergency pause came 46 minutes after the drain began. Attribution to North Korea's Lazarus Group is preliminary.",
    failed: "A verification setting with a threshold of one: a single party could approve any withdrawal.",
    overwatch:
      "A threshold of one is the same weakness Overwatch penalises in multisigs. It does not read bridge verifier settings yet; they belong in the same check, with anything under two independent verifiers treated as a single key.",
    sources: [
      ["The Block", "https://www.theblock.co/post/397988/kelp-dao-293-million-defi-hack-lazarus-layerzero"],
      ["The Block (LayerZero's account)", "https://theblock.co/post/398028/layerzero-kelp-dao-lazarus"],
      ["Nexus Mutual", "https://nexusmutual.io/blog/kelpdao-layerzero-incident-report"],
    ],
  },
  {
    id: "drift",
    name: "Drift Protocol",
    date: "April 1, 2026",
    where: "Solana",
    loss: "about $280M to $285M",
    happened:
      "Between March 23 and 30, attackers got two of the five Security Council members to sign transactions in advance using durable nonces, which do not expire. Days earlier the council had moved to a 2-of-5 threshold with no timelock. On April 1 the attacker submitted the pre-signed transactions: two transactions four slots apart created, approved and executed a malicious admin transfer, and the vaults were drained in about twelve minutes. No smart-contract bug was involved. Investigators link the attack to North Korea.",
    failed:
      "A low threshold, no timelock, and signers who could be persuaded to sign transactions that would be held and used later.",
    overwatch:
      "Every one of these conditions is onchain and graded: no timelock (−25), two or fewer signatures needed (−20), signers holding durable nonce accounts (−10 each), and together they mark a protocol red. Applying Overwatch's current rules to the reconstructed timeline raises a critical alert days before the drain. That is a backtest, not a live catch.",
    sources: [
      ["Halborn", "https://www.halborn.com/blog/post/explained-the-drift-hack-april-2026"],
      [
        "BleepingComputer",
        "https://bleepingcomputer.com/news/security/drift-loses-280-million-as-hackers-seize-security-council-powers",
      ],
      ["Chainalysis", "https://www.chainalysis.com/blog/lessons-from-the-drift-hack/"],
      [
        "CoinDesk",
        "https://www.coindesk.com/tech/2026/04/02/how-a-solana-feature-designed-for-convenience-let-an-attacker-drain-usd270-million-from-drift",
      ],
    ],
  },
  {
    id: "resolv",
    name: "Resolv Labs",
    date: "March 22, 2026",
    where: "Ethereum",
    loss: "about $25M, after minting about 80M unbacked USR",
    happened:
      "Attackers reached Resolv's cloud infrastructure and its AWS key management service, which held the key behind the protocol's minting role. With it they minted about 80 million USR against roughly $100K to $200K of deposits and swapped out about $25M; USR fell to around $0.25. The contracts worked as designed: whatever that role signed, they minted, and there was no maximum. The initial access route has not been fully disclosed.",
    failed: "An off-chain key with unlimited power onchain: one signature could mint any amount.",
    overwatch:
      "Overwatch cannot see a cloud key, but it can see what a key is allowed to do. It already flags mints whose authority is a single key as risky collateral for the protocols that accept them.",
    sources: [
      ["CertiK", "https://certik.com/blog/resolv-protocol-incident-analysis"],
      ["Gizmodo", "https://gizmodo.com/attacker-exploits-crypto-stablecoin-for-a-25-million-payday-2000736927"],
      ["BlockEden", "https://blockeden.xyz/blog/2026/04/21/resolv-labs-usr-stablecoin-exploit-aws-kms-key-compromise/"],
    ],
  },
  {
    id: "step",
    name: "Step Finance",
    date: "January 31, 2026",
    where: "Solana",
    loss: "about $27M to $40M (261,854 SOL)",
    happened:
      "About 261,854 SOL left Step Finance's treasury. Write-ups attribute it to compromised executive devices that gave the attackers signing power over the treasury keys; investigators had not confirmed the route at the time. The STEP token fell more than 90 percent, and Step Finance, SolanaFloor and Remora Markets shut down within weeks.",
    failed: "Treasury keys kept on devices that could be compromised.",
    overwatch:
      "Overwatch watches who controls a protocol's programs, not a team's treasury. A drain signed with the real keys looks like ordinary transfers to it.",
    sources: [
      ["Cointelegraph", "https://cointelegraph.com/news/step-finance-treasury-breach-solana-step-token-crash"],
      ["Rekt", "https://rekt.news/fr/step-finance-rekt"],
      ["Techloy", "https://www.techloy.com/step-finance-shuts-down-after-40m-january-hack/"],
    ],
  },
  {
    id: "swissborg",
    name: "SwissBorg, through Kiln",
    date: "September 8, 2025",
    where: "Solana",
    loss: "about $41M (about 193,000 SOL)",
    happened:
      "Attackers breached the API of Kiln, SwissBorg's staking partner. Transactions that Kiln's API built for SwissBorg's Earn program carried extra instructions that handed authority over SwissBorg's stake accounts to attacker addresses; Hypernative counts eight such authorize calls. Days later the attacker withdrew about 193,000 SOL. Reports differ on whether the staker or the withdrawer authority was changed. SwissBorg reimbursed affected users from its treasury.",
    failed:
      "Transactions built by a third party were signed without checking every instruction, so an authority change rode along unseen.",
    overwatch:
      "This is a control change on Solana: an account's authority moving to an unknown address, with days between that change and the withdrawal. Overwatch does not watch stake accounts today, but it is the same check it runs on upgrade authorities and multisigs.",
    sources: [
      ["Cointelegraph", "https://cointelegraph.com/news/swissborg-hacked-41m-sol-api-compromise"],
      [
        "Hypernative",
        "https://www.hypernative.io/blog/learning-from-the-swissborg-41m-exploit-how-hypernative-protects-staking-ecosystems",
      ],
      ["QuillAudits", "https://www.quillaudits.com/blog/hack-analysis/swissborg-exploit"],
    ],
  },
  {
    id: "bybit",
    name: "Bybit",
    date: "February 21, 2025",
    where: "Ethereum",
    loss: "about $1.46B (about 401,000 ETH)",
    happened:
      "Lazarus compromised a Safe{Wallet} developer's laptop on February 4 and later injected JavaScript into the Safe web interface that activated only for Bybit's cold wallet. Three of six signers approved what their screens showed as a routine transfer. What they actually signed replaced the wallet's logic with the attacker's, which then emptied it. The malicious code was removed from the site minutes after the theft.",
    failed:
      "Signers trusted what the interface displayed instead of what they signed, and once three signatures existed nothing delayed execution.",
    overwatch:
      "Replacing a wallet's logic is a control change. Overwatch watches the Solana equivalents, upgrade authorities and multisig settings, and would alert when such a change lands. Here the change and the drain came together, so an alert would have been a report, not a warning.",
    sources: [
      [
        "BleepingComputer",
        "https://www.bleepingcomputer.com/news/security/lazarus-hacked-bybit-via-a-breached-safe-wallet-developer-machine/",
      ],
      ["NCC Group", "https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/"],
      ["Halborn", "https://halborn.com/blog/post/explained-the-bybit-hack-revisited"],
    ],
  },
  {
    id: "radiant",
    name: "Radiant Capital",
    date: "October 16, 2024",
    where: "Arbitrum and BNB Chain",
    loss: "about $50M to $58M",
    happened:
      "Malware on the devices of at least three core developers changed what was sent to their hardware wallets. The screens showed normal transactions and the familiar Safe errors, so signers retried; in the background they signed a transfer of ownership of the lending pools. Three signatures out of eleven were enough. The attacker took ownership, upgraded the pool contracts and drained them. Radiant later put ownership behind a timelock.",
    failed: "A threshold of 3 out of 11: fewer than a third of the signers could hand over the protocol.",
    overwatch:
      "Overwatch deducts points when a multisig needs fewer than half of its signers, and a transfer of ownership is a critical event. On Solana, both would have been on the protocol's page.",
    sources: [
      ["Radiant post-mortem", "https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081"],
      ["Cointelegraph", "https://cointelegraph.com/news/radiant-capital-resumes-lending-post-hack"],
      ["Revoke.cash", "https://revoke.cash/exploits/radiant"],
    ],
  },
];

export default function CaseStudies() {
  return (
    <>
      <JsonLd // SEO component
        data={[
          // SEO component
          breadcrumbs([["Case studies", "/case-study"]]), // SEO component
          {
            // SEO component
            "@type": "Article", // SEO component
            headline: "Ten control attacks: how attackers took over instead of breaking code", // SEO component
            description: DESCRIPTION, // SEO component
            url: `${SITE_URL}/case-study`, // SEO component
            author: { "@id": ORGANIZATION_ID }, // SEO component
            publisher: { "@id": ORGANIZATION_ID }, // SEO component
            about: ATTACKS.map((a) => a.name), // SEO component
          }, // SEO component
        ]} // SEO component
      />
      {/* SEO component */}
      <PageHero
        dock="Case studies"
        lines={["Ten control attacks."]}
        lede="Each of these losses came from someone gaining control: a key, a signer, a verifier or a signing system. The code did what it was told. For each one: what happened, what failed, and what Overwatch can and cannot see."
      />

      <section className="page-block docs" data-dock="Case studies">
        <nav className="docs__toc" aria-label="On this page">
          <p className="mono label">On this page</p>
          <ol>
            {ATTACKS.map((a) => (
              <li key={a.id}>
                <a href={`#${a.id}`}>{a.name}</a>
              </li>
            ))}
            <li>
              <a href="#common">What they share</a>
            </li>
          </ol>
        </nav>

        <div className="docs__body">
          <p>
            Compromised keys and signers have overtaken smart-contract bugs as the leading cause of losses in 2026 (
            <a
              href="https://crypto.news/defi-hacks-2026-billion-lost-same-attack-keeps-working/"
              target="_blank"
              rel="noreferrer"
            >
              crypto.news, citing CertiK
            </a>
            ). The ten cases below are listed newest first. Three are on Solana, where Overwatch reads control directly;
            the rest show the same weaknesses on other chains and in centralized systems.
          </p>

          {ATTACKS.map((a, i) => (
            <article key={a.id}>
              <h2 id={a.id}>
                {i + 1}. {a.name}
              </h2>
              <p className="mono label">
                {a.date} · {a.where} · {a.loss}
              </p>
              <p>
                <b>What happened.</b> {a.happened}
              </p>
              <p>
                <b>What failed.</b> {a.failed}
              </p>
              <p>
                <b>What Overwatch sees.</b> {a.overwatch}
              </p>
              <p className="mono label">
                Sources:{" "}
                {a.sources.map(([label, url], j) => (
                  <span key={url}>
                    {j > 0 && " · "}
                    <a href={url} target="_blank" rel="noreferrer">
                      {label}
                    </a>
                  </span>
                ))}
              </p>
            </article>
          ))}

          <h2 id="common">What they share</h2>
          <ul className="bullets">
            <li>The code worked. Attackers got the power to change it, or to sign with the keys that control it.</li>
            <li>
              Control failed at its weakest setting: a low threshold (Drift 2 of 5, Radiant 3 of 11), a single verifier
              (KelpDAO), a single admin key (Wasabi), or keys stored together (Humanity Protocol).
            </li>
            <li>
              Where time passed between control weakening and funds moving (Drift&apos;s week of pre-signing,
              Kiln&apos;s days between the authority change and the withdrawal), anyone reading the onchain control
              state had time to warn depositors.
            </li>
            <li>
              Several began entirely off-chain (Binance, Resolv, Step Finance). Overwatch reads the onchain control of
              Solana protocols; it cannot see laptops, cloud keys or signing screens, and it warns after a change lands
              rather than preventing it.
            </li>
          </ul>
          <p className="page-note">
            Figures are as reported and often differ between sources, so ranges are shown. Attributions are those of
            investigators. Last updated November 9, 2026.
          </p>
        </div>
      </section>
    </>
  );
}
