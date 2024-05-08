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
    skipTarget = [],
    fingerprint = false,
    turnstile = false,
    connectOption = {},
    fpconfig = {}
}) => {
    return new Promise(async (resolve, reject) => {
        var global_target_status = false

        function targetFilter({ target, skipTarget }) {

            if (global_target_status === false) {
                return true
            }
            var response = false
            try {
                response = !!target.url()
                if (skipTarget.find(item => String(target.url()).indexOf(String(item) > -1))) {
                    response = true
                }
            } catch (err) { }
            return response;
        }

        const setTarget = ({ status = true }) => {
            global_target_status = status
        }

        
        let resultBrowser;
        if(product == "firefox") {
            resultBrowser = await firefox.startSession({
                args: args,
                protocol: protocol,
                headless: headless,
                customConfig: customConfig,
                proxy: proxy
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

        console.log("AQUI 0");

        const browserPptr = await puppeteerExtra.connect({
            args: args,
            product: product,
            protocol: protocol,
            targetFilter: (target) => targetFilter({ target: target, skipTarget: skipTarget }),
            browserWSEndpoint: (protocol == "cdp") ? session.browserWSEndpoint : `ws://127.0.0.1:${port}/`,
            ...connectOption
        });
        console.log("AQUI 1");

        //await browserPptr.newPage();
        var pages = await browserPptr.pages();
        var page = pages[0];

        console.log("AQUI 2");

        setTarget({ status: true });

        if (proxy && proxy.username && proxy.username.length > 0) {
            await page.authenticate({ username: proxy.username, password: proxy.password });
        }

        var solve_status = true

        const setSolveStatus = ({ status }) => {
            solve_status = status
        }

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

        console.log("AQUI 3");

        await page.setUserAgent(session.agent || session.userAgent);

        console.log("AQUI 4");

        await page.setViewport({
            width: 1920,
            height: 1080
        });

        browserPptr.on('disconnected', async () => {
            notice({
                message: 'Browser Disconnected',
                type: 'info'
            })
            try { setSolveStatus({ status: false }) } catch (err) { }
            await chromium.closeSession({
                xvfbsession: xvfbsession,
                cdpSession: cdpSession,
                browser: browserPptr
            }).catch(err => { console.log(err.message); })
        });


        browserPptr.on('targetcreated', async target => {
            var newPage = await target.page();

            try {
                await newPage.setUserAgent(session.agent);
            } catch (err) {
                // console.log(err.message);
            }

            try {
                await newPage.setViewport({
                    width: 1920,
                    height: 1080
                });
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

        resolve({
            port: port,
            puppeteerExtra: puppeteer,
            browser: browserPptr,
            page: page,
            xvfbsession: xvfbsession,
            cdpSession: cdpSession,
            session: session,
            setTarget: setTarget
        })
    })
}





