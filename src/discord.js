import axios from "axios";

/**
 * Envoie une alerte au webhook Discord sous forme d'embed.
 */
export async function sendDiscordAlert(webhookUrl, item, searchLabel, gifUrl, dealInfo) {
  const fields = [
    {
      name: "Prix",
      value: item.price ? `${item.price} ${item.currency}` : "N/A",
      inline: true,
    },
    {
      name: "Vendeur",
      value: item.user || "inconnu",
      inline: true,
    },
  ];

  if (dealInfo) {
    fields.push(
      { name: "🔥 Remise estimee", value: `-${dealInfo.discountPercent}%`, inline: true },
      { name: "Prix demande", value: `${item.price} ${item.currency}`, inline: true },
      { name: "Source retenue", value: dealInfo.source || "inconnue", inline: true }
    );

    if (dealInfo.ebayPriceDisplay) {
      fields.push({
        name: "Cote eBay",
        value: `${dealInfo.ebayPriceDisplay.price} EUR (${dealInfo.ebayPriceDisplay.sampleSize} annonces)`,
        inline: true,
      });
    }
    if (dealInfo.cardmarketPriceDisplay) {
      fields.push({
        name: "Cote Cardmarket",
        value: `${dealInfo.cardmarketPriceDisplay.price} EUR`,
        inline: true,
      });
    }

    fields.push(
      { name: "Carte identifiee", value: `${dealInfo.cardName}${dealInfo.setName ? ` (${dealInfo.setName})` : ""}${dealInfo.identificationSource === "IA" ? " 🤖" : ""}`, inline: false },
      { name: "Etat", value: `${dealInfo.condition}${dealInfo.conditionSource ? ` (${dealInfo.conditionSource})` : ""}`, inline: true },
      { name: "Langue supposee", value: dealInfo.language, inline: true }
    );

    if (dealInfo.viewCount !== null && dealInfo.viewCount !== undefined) {
      fields.push({ name: "👁️ Vues", value: `${dealInfo.viewCount}`, inline: true });
    }
    if (dealInfo.favouriteCount !== null && dealInfo.favouriteCount !== undefined) {
      fields.push({ name: "❤️ Favoris", value: `${dealInfo.favouriteCount}`, inline: true });
    }
  }

  const embed = {
    title: item.title?.slice(0, 250) || "Nouvelle annonce Pokemon",
    url: item.url,
    color: dealInfo ? 0x2ecc71 : 0xffcb05, // vert si bonne affaire, jaune sinon
    description: dealInfo
      ? `⚠️ Estimation automatique, a verifier avant achat. Recherche: **${searchLabel}**`
      : `Recherche: **${searchLabel}**`,
    fields,
    thumbnail: item.photoUrl ? { url: item.photoUrl } : undefined,
    image: gifUrl ? { url: gifUrl } : undefined,
    timestamp: new Date().toISOString(),
  };

  await axios.post(webhookUrl, {
    username: "Vinted Pokemon Alerts",
    embeds: [embed],
    components: [
      {
        type: 1, // action row
        components: [
          {
            type: 2, // button
            style: 5, // link
            label: "Voir l'annonce",
            url: item.url,
          },
        ],
      },
    ],
  });
}
