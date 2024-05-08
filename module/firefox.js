import { launch } from 'puppeteer';
import CDP from 'chrome-remote-interface';
import axios from 'axios'
import Xvfb from 'xvfb';
import { notice, slugify } from './general.js'
import * as firefoxPath from "firefox-location";

const PORT_DEBUG = 9222;
let browser;

export const closeSession = async ({ xvfbsession, cdpSession, browser }) => {
    if (xvfbsession) {
        try {
            xvfbsession.stopSync();
        } catch (err) { }
    }
    if (cdpSession) {
        try {
            await cdpSession.close();
        } catch (err) { }
    }
    if (browser) {
        try {
            await browser.close();
        } catch (err) { }
    }
    return true
}


export const startSession = ({ protocol = "cdp", args = [], headless = 'auto', customConfig = {}, proxy = {} }) => {
    return new Promise(async (resolve, reject) => {
        try {
            var xvfbsession = null
            var browserPath = customConfig.executablePath || customConfig.browsePath || firefoxPath;

            if (slugify(process.platform).includes('linux') && headless === false) {
                notice({
                    message: 'This library is stable with headless: true in linuxt environment and headless: false in Windows environment. Please send headless: \'auto\' for the library to work efficiently.',
                    type: 'error'
                })
            } else if (slugify(process.platform).includes('win') && headless === true) {
                notice({
                    message: 'This library is stable with headless: true in linuxt environment and headless: false in Windows environment. Please send headless: \'auto\' for the library to work efficiently.',
                    type: 'error'
                })
            }

            if (headless === 'auto') {
                headless = slugify(process.platform).includes('linux') ? true : false
            }

            const browserFlags = ['--remote-debugging-port '+PORT_DEBUG].concat(args);

            if (headless === true) {
                slugify(process.platform).includes('win') ? browserFlags.push('--headless=new') : ''
            }

            if (proxy && proxy.host && proxy.host.length > 0) {
                chromeFlags.push(`--proxy-server=${proxy.host}:${proxy.port}`);
            }

            if (process.platform === 'linux') {
                try {
                    var xvfbsession = new Xvfb({
                        silent: true,
                        xvfb_args: ['-screen', '0', '1920x1080x24', '-ac']
                    });
                    xvfbsession.startSync();
                } catch (err) {
                    notice({
                        message: 'You are running on a Linux platform but do not have xvfb installed. The browser can be captured. Please install it with the following command\n\nsudo apt-get install xvfb\n\n' + err.message,
                        type: 'error'
                    })
                }
            }

            // extraPrefsFirefox?: Record<string, unknown>;
            //* {@link https://searchfox.org/mozilla-release/source/modules/libpref/init/all.js | Additional preferences } that can be passed when launching with Firefox.

            var browser = await launch({
                product: "firefox",
                protocol: protocol,
                executablePath: browserPath,
                args: browserFlags,
                ...customConfig
            });

            var cdpSession = await CDP({ port: PORT_DEBUG });
            const { Network, Page, Runtime, DOM } = cdpSession;
            await Promise.all([
                Page.enable(),
                Page.setLifecycleEventsEnabled({ enabled: true }),
                Runtime.enable(),
                Network.enable(),
                DOM.enable()
            ]);

            var session = await axios.get('http://localhost:' + chrome.port + '/json/version')
                .then(response => {
                    response = response.data
                    return {
                        browserWSEndpoint: response.webSocketDebuggerUrl,
                        agent: response['User-Agent']
                    }
                })
                .catch(err => {
                    throw new Error(err.message)
                })
            return resolve({
                session: session,
                cdpSession: cdpSession,
                browser: browser,
                xvfbsession: xvfbsession
            })

        } catch (err) {
            console.log(err);
            throw new Error(err.message)
        }
    })
}

