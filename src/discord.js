import axios from "axios";

/**
 * Determine la couleur de l'embed selon l'ampleur de la remise (bonne
 * affaire) ou une couleur neutre pour une alerte classique.
 */
function getEmbedColor(dealInfo) {
  if (!dealInfo) return 0xffcb05; // jaune Pokemon, alerte classique
  if (dealInfo.discountPercent >= 70) return 0xe74c3c; // rouge, tres grosse affaire
  if (dealInfo.discountPercent >= 50) return 0xe67e22; // orange, grosse affaire
  return 0x2ecc71; // vert, bonne affaire
}

/**
 * Envoie une alerte au webhook Discord sous forme d'embed.
 */
export async function sendDiscordAlert(webhookUrl, item, searchLabel, gifUrl, dealInfo) {
  const fields = [];

  if (dealInfo) {
    // Badge de remise et prix en premier, le plus visible d'un coup d'oeil.
    fields.push(
      { name: "🔥 Remise estimee", value: `-${dealInfo.discountPercent}%`, inline: true },
      { name: "Prix demande", value: `${item.price} ${item.currency}`, inline: true }
    );

    // Ce que le bot a compris du titre -> permet de verifier d'un coup
    // d'oeil si l'identification est correcte avant d'aller plus loin.
    const cardLine = [
      dealInfo.cardName,
      dealInfo.cardNumber,
      dealInfo.setName ? `— ${dealInfo.setName}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    fields.push({ name: "🔍 Carte detectee", value: cardLine || "inconnue", inline: false });

    // Methode d'identification utilisee, toujours visible (pas juste un
    // symbole cache dans le titre) -> important de savoir si ca vient du
    // texte de l'annonce (fiable) ou d'un scan photo/IA (a verifier de plus
    // pres, plus susceptible d'erreur).
    const sourceLabels = {
      dictionnaire: "📝 Texte de l'annonce",
      devine: "📝 Texte de l'annonce (estimation)",
      IA: "🤖 IA (texte)",
    };
    const sourceLabel =
      sourceLabels[dealInfo.identificationSource] ||
      (dealInfo.identificationSource?.startsWith("scan image")
        ? `📷 ${dealInfo.identificationSource}`
        : dealInfo.identificationSource || "inconnue");
    fields.push({ name: "Methode d'identification", value: sourceLabel, inline: false });

    fields.push({ name: "Cote Cardmarket (TCGdex)", value: `${dealInfo.referencePrice} EUR`, inline: true });

    fields.push(
      { name: "Etat", value: `${dealInfo.condition}${dealInfo.conditionSource ? ` (${dealInfo.conditionSource})` : ""}`, inline: true },
      { name: "Langue supposee", value: dealInfo.language, inline: true }
    );

    if (dealInfo.viewCount !== null && dealInfo.viewCount !== undefined) {
      fields.push({ name: "👁️ Vues", value: `${dealInfo.viewCount}`, inline: true });
    }
    if (dealInfo.favouriteCount !== null && dealInfo.favouriteCount !== undefined) {
      fields.push({ name: "❤️ Favoris", value: `${dealInfo.favouriteCount}`, inline: true });
    }
  } else {
    fields.push(
      { name: "Prix", value: item.price ? `${item.price} ${item.currency}` : "N/A", inline: true },
      { name: "Vendeur", value: item.user || "inconnu", inline: true }
    );
  }

  const embed = {
    title: `${dealInfo ? `${dealInfo.cardName}${dealInfo.setName ? ` (${dealInfo.setName})` : ""} — ` : ""}${item.title?.slice(0, 200) || "Nouvelle annonce Pokemon"}`,
    url: item.url,
    color: getEmbedColor(dealInfo),
    description: dealInfo
      ? `⚠️ Estimation automatique, a verifier avant achat. Recherche: **${searchLabel}**`
      : `Recherche: **${searchLabel}**`,
    fields,
    thumbnail: item.photoUrl ? { url: item.photoUrl } : undefined,
    image: gifUrl ? { url: gifUrl } : undefined,
    timestamp: new Date().toISOString(),
  };

  const buttons = [
    {
      type: 2, // button
      style: 5, // link
      label: "Voir l'annonce",
      url: item.url,
    },
  ];

  // IMPORTANT: les webhooks Discord "classiques" (non lies a une vraie
  // application enregistree) ignorent silencieusement le champ "components"
  // sans la moindre erreur, sauf si ce parametre est ajoute a l'URL.
  const webhookUrlWithComponents = webhookUrl.includes("?")
    ? `${webhookUrl}&with_components=true`
    : `${webhookUrl}?with_components=true`;

  await axios.post(webhookUrlWithComponents, {
    username: "Vinted Pokemon Alerts",
    embeds: [embed],
    components: [
      {
        type: 1, // action row
        components: buttons,
      },
    ],
  });
}
