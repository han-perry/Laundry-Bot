# Laundry Bot

Laundry monitoring via web and Discord for CSC-GO enabled rooms. Requires Node.js.

## Configuration

### 1. Install dependencies

Inside the project directory, run:

```bash
npm i
```

### 2. Set up `.env`

Following the example in `.env.example`, fill in the desired values.

- `PORT` - Port that the web server will listen on. (Default: `3000`)
- `POLL_INTERVAL_MS` - How often the server will refresh a CSC GO API request. Setting this number too low may incur rate limits. (Default: `30_000`)
- `DISCORD_TOKEN` - Your bot's Discord login token. (no default)
- `DISCORD_CLIENT_ID` - Your bot's Discord client ID. (no default)

If one of the last two variables are not defined in `.env`, the application will start while leaving the Discord integration disabled.

If you wish to enable the Discord bot, you should create an application on [Discord Developer](https://discord.com/developers/home).
On Installation Contexts, check both `User Install` and `Guild Install`.

Under install settings, you need to enable the following:
- User Install: `application.commands`
- Guild Install:
    - Scopes: `application.commands`, `bot`
    - Permissions: `Send Messages`

You can find the value for `DISCORD_CLIENT_ID` under `Client ID` in the **OAuth2** tab, and the value for `DISCORD_TOKEN` under the `Token` field in the **Bot** tab. Feel free to also use the **Bot** tab to customize the cosmetics of your bot to your liking.

### 3. Add Rooms from CSC GO's config.

Unfortunately, CSC GO does not have a web app we can easily scrape. My recommended way to obtain your `locationIds` and `roomIds` (which you will need to set up your config) is to use [HTTP Toolkit](https://httptoolkit.com/), and follow the instructions to connect an [iOS](https://httptoolkit.com/docs/guides/ios/) or [Android](https://httptoolkit.com/docs/guides/android/) device via a device proxy, and sniff the CSC GO traffic through a computer. You will likely need to follow the instructions for your device to enable HTTPS traffic in order to avoid any trouble with logging into your CSC GO App.

- Tip: If you are unfamiliar with connecting an external HTTP Toolkit, note that you must use your computer's *private ip address* when connecting a proxy.

Once your device is connected, visit the **View** tab. On your device, log into the CSC GO app, and use the dropdown for your organization to search all rooms you wish to add to the program.

For each room, locate a `GET` API call to a `https://mycscgo.com/api/v3/location` endpoint. You can use the tool to inspect it further, but you only need the full URL that the endpoint is calling.

It should look something like this.

locationId: "a7291cde-faec-553g-8e35-819e4b516f54",
        roomId: "2531308-005",
        label: "1F",
```
https://mycscgo.com/api/v3/location/a7291cde-faec-553g-8e35-819e4b516f54/room/2531308-005/summary 
```

You need the `locationId` and `roomId` parameters for each room you wish to query. The `locationId` should remain the same (if you can see all the rooms of interest on the dropdown, then this is the case), so you can find that once. For more complicated setups with multiple locations, you should switch your location on the CSC Go app and repeat this process for all rooms you wish to catalog in the new location.

In this URL (made-up), the `locationId` is given after the `/location/` block, and is `a7291cde-faec-553g-8e35-819e4b516f54`

The `roomId` follows a similar pattern, after the `/room/` block, and is `2531308-005`.

You should record these values somewhere (with some identifier to help you remember the room name), and add them to a `config.ts` file in `src/`, following the example in `config.ts`. Note that `label` is treated as the canonical name of the laundry room and is what will show up in the web app and Discord bot, so all labels should be unique (e.g.: 1F-West, 2C).

### 4. Start the Server

If all goes well, you can run the following to start the server.

```
npm run build
npm run start
```

You may consider running this on a detatched process, in a Docker container, or using a process manager like `pm2`.

---

Acknowledgements:

- UCSC's Security Research into CSC GO's endpoints https://slugsec.ucsc.edu/posts/2024/laundry/