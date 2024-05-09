import { launch } from 'puppeteer';
import chromium from '@sparticuz/chromium'
import CDP from 'chrome-remote-interface';
import axios from 'axios'
import Xvfb from 'xvfb';
import { notice, slugify } from './general.js'
import chromeLocation from "chrome-location";

let PORT_DEBUG;
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


export const startSession = ({protocol = "cdp", args = [], headless = 'auto', customConfig = {}, proxy = {} }) => {
    return new Promise(async (resolve, reject) => {
        try {
            var xvfbsession = null
            var chromePath = customConfig.executablePath || customConfig.chromePath || chromeLocation; // || chromium.path;

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

            let chromeFlags = ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled'].concat(args);

            if (headless === true) {
                slugify(process.platform).includes('win') ? chromeFlags.push('--headless=new') : ''
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

            browser = await launch({
                //dumpio: true,
                //debuggingPort: PORT_DEBUG,
                product: "chrome",
                protocol: protocol,
                executablePath: chromePath,
                headless: headless,
                args: chromeFlags,
                ...customConfig
            });

            let wsString = browser.wsEndpoint();
            PORT_DEBUG = (protocol == "cdp") ? wsString.split(":")[2].split("/")[0] : ((wsString.indexOf("/") >= 0) ? wsString.split(":")[2].split("/")[0] : wsString.split(":")[2]);

            var cdpSession;
            let session = {browserWSEndpoint: wsString, agent: null}; // n alterar
            session = await axios.get('http://127.0.0.1:' + PORT_DEBUG + '/json/version')
            .then(response => {
                response = response.data
                return {
                    browserWSEndpoint: response.webSocketDebuggerUrl,
                    agent: response['User-Agent']
                }
            })
            .catch(err => {
                throw new Error(err.message)
            });
            //session.browserWSEndpoint = wsString;

            return resolve({
                port: PORT_DEBUG,
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

