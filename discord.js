import axios from "axios";

/**
 * Envoie une alerte au webhook Discord sous forme d'embed.
 */
export async function sendDiscordAlert(webhookUrl, item, searchLabel) {
  const embed = {
    title: item.title?.slice(0, 250) || "Nouvelle annonce Pokemon",
    url: item.url,
    color: 0xffcb05, // jaune Pokemon
    description: `Recherche: **${searchLabel}**`,
    fields: [
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
    ],
    thumbnail: item.photoUrl ? { url: item.photoUrl } : undefined,
    timestamp: new Date().toISOString(),
  };

  await axios.post(webhookUrl, {
    username: "Vinted Pokemon Alerts",
    embeds: [embed],
  });
}
