import StealthPlugin from "puppeteer-extra-plugin-stealth";
let stealth = StealthPlugin();
import puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra'
let puppeteerExtra = addExtra(puppeteer);
stealth.enabledEvasions.delete("chrome.runtime");
stealth.enabledEvasions.delete("iframe.contentWindow");
puppeteerExtra.use(stealth);
import * as chromium from './module/chromium.js'
import * as firefox from './module/firefox.js'
import { notice, sleep } from './module/general.js'
import { checkStat } from './module/turnstile.js'
import { protectPage, protectedBrowser } from 'puppeteer-afp'
import { puppeteerRealBrowser } from './module/old.js'

export { puppeteerRealBrowser };


async function handleNewPage({ page, config = {} }) {
    // fp(page);
    protectPage(page, {
        webRTCProtect: false,
        ...config
    });
    return page
}

export const connect = ({
    product = "chrome",
    protocol = "cdp",
    args = [],
    headless = 'auto',
    customConfig = {},
    proxy = {},
    fingerprint = false,
    turnstile = false,
    connectOption = {},
    fpconfig = {}
}) => {
    return new Promise(async (resolve, reject) => {
        let resultBrowser;

        if(product == "firefox") {
            resultBrowser = await firefox.startSession({
                args: args,
                protocol: protocol,
                headless: headless,
                customConfig: customConfig,
                proxy: proxy,
            })
        } else {
            resultBrowser = await chromium.startSession({
                args: args,
                protocol: protocol,
                headless: headless,
                customConfig: customConfig,
                proxy: proxy
            })
        }

        let session = resultBrowser.session;
        let cdpSession = resultBrowser.cdpSession;
        let browser = resultBrowser.browser;
        let xvfbsession = resultBrowser.xvfbsession;
        let port = resultBrowser.port;
        
        let browserPptr;
        if(product == "firefox") browserPptr = browser;

        if(product == "firefox" && protocol == "webDriverBiDi") {
            protocol = "cdp";
        } else if(product == "firefox" && protocol == "cdp") {
            protocol = "webDriverBiDi";
        }

        browserPptr = await puppeteerExtra.connect({
            browser: browser, //(product == "firefox") ? browser : null,
            args: args,
            product: product,
            protocol: protocol,
            browserWSEndpoint: session.browserWSEndpoint,
            ...connectOption
        });

        var page = await browserPptr.pages();
        page = page[0];


        if (proxy && proxy.username && proxy.username.length > 0) {
            await page.authenticate({ username: proxy.username, password: proxy.password });
        }

        var solve_status = true

        const setSolveStatus = ({ status }) => {
            solve_status = status
        }

        // const autoSolve = ({ page }) => {
        //     return new Promise(async (resolve, reject) => {
        //         for(let i = 0; i < 10; i++) {
        //             try {
        //                 await sleep(1500)
        //                 await checkStat({ page: page }).catch(err => { })
        //                 break;
        //             } catch (err) { }
        //         }
        //         resolve()
        //     })
        // }

        const autoSolve = ({ page }) => {
            return new Promise(async (resolve, reject) => {
                while (solve_status) {
                    try {
                        await sleep(1500)
                        await checkStat({ page: page }).catch(err => { })
                    } catch (err) { }
                }
                resolve()
            })
        }

        if (fingerprint === true) {
            handleNewPage({ page: page, config: fpconfig });
        }

        if (turnstile === true) {
            setSolveStatus({ status: true })
            autoSolve({ page: page, browser: browserPptr })
        }

        // alterei o protocol, por inverti abaixo 
        if(product == "chrome" || (product == "firefox" && protocol == "webDriverBiDi")) await page.setUserAgent(session.agent || session.userAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0");        

        // await page.setViewport({
        //     width: 1920,
        //     height: 1080
        // });

        browserPptr.on('disconnected', async () => {
            notice({
                message: 'Browser Disconnected',
                type: 'info'
            })
            try { setSolveStatus({ status: false }) } catch (err) { }
            if(product == "firefox") {
                await firefox.closeSession({
                    xvfbsession: xvfbsession,
                    cdpSession: cdpSession,
                    browser: browserPptr
                }).catch(err => { console.log(err.message); })
            } else {
                await chromium.closeSession({
                    xvfbsession: xvfbsession,
                    cdpSession: cdpSession,
                    browser: browserPptr
                }).catch(err => { console.log(err.message); })
            }
        });

        browserPptr.on('targetcreated', async target => {
            var newPage = await target.page();

            try {
                // alterei o protocol, por inverti abaixo
                if(product == "chrome" || (product == "firefox" && protocol == "webDriverBiDi")) await page.setUserAgent(session.agent || session.userAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0");        
            } catch (err) {
                // console.log(err.message);
            }

            try {
                // await newPage.setViewport({
                //     width: 1920,
                //     height: 1080
                // });
            } catch (err) {
                // console.log(err.message);
            }

            if (newPage && fingerprint === true) {
                try {
                    handleNewPage({ page: newPage, config: fpconfig });
                } catch (err) { }
            }

            if (turnstile === true) {
                autoSolve({ page: newPage })
            }
        });

        return resolve({
            port: port,
            puppeteerExtra: puppeteer,
            browser: browserPptr,
            page: page,
            xvfbsession: xvfbsession,
            cdpSession: cdpSession,
            session: session
        })
    })
}
