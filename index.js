const puppeteer = require("puppeteer");
const fs = require("fs");

const BASE_URL = "https://maps.lib.utexas.edu/maps/americas.html";
const IMAGE_BASE_URL = "https://maps.lib.utexas.edu/maps/";
const FOLDER = "./americas/";
const CUSTOM_NAME_SPACE = "americas";
const LAUNCH_OPTIONS = {
  headless: false,
  devtools: true,
  args: ["--no-sandbox", "--disable-gpu"],
};
const FILE_FORMATS = [".jpg", ".pdf", ".jpeg", ".png", ".webp"];
const POSSIBLE_SELECTORS = [
  ".maps-pages > ul > li > a",
  ".maps-pages > dl > dt > a",
  ".maps-pages > dt > li > a",
  ".maps-pages > dl > dt > li > a",
];
const BASE_URL_NAME_SPACE =
  extractSegmentFromURL(BASE_URL) === "maps"
    ? CUSTOM_NAME_SPACE
    : extractSegmentFromURL(BASE_URL);

// onc - navigational maps, already downloaded
const IGNORE_URLS = ["onc", "marine.geogarage.com"];

function extractSegmentFromURL(url) {
  const pattern = /([^/]+)\/[^/]*$/;

  const match = url.match(pattern);
  return match ? match[1] : null;
}

function extractNextSegmentIfAny(url, baseSegment) {
  const pattern = new RegExp(`${baseSegment}/([^/]+)`);
  const match = url.match(pattern);

  return match ? match[1] : null;
}

function processURL(url) {
  if (!url.includes(BASE_URL_NAME_SPACE)) return null;

  const nextSegment = extractNextSegmentIfAny(url, BASE_URL_NAME_SPACE);

  if (nextSegment && !nextSegment.includes(".")) {
    return nextSegment;
  }

  return null;
}

const handleError = (err) => (err ? console.log(err) : null);

const logImgInfo = (PATH, fileName) => {
  console.log("IMAGE SAVED IN PATH: ", PATH);
  console.log("IMAGE NAME: ", fileName);
};

const createImg = async (url, fileName, page, buffer) => {
  console.log("=========");

  if (!fs.existsSync(FOLDER)) {
    fs.mkdirSync(FOLDER);
  }
  console.log("url", url);
  const INNER_DIR = processURL(url);
  console.log("INNER_DIR", INNER_DIR);
  if (INNER_DIR && !fs.existsSync(FOLDER + INNER_DIR)) {
    fs.mkdirSync(FOLDER + INNER_DIR);
  }

  const PATH = INNER_DIR
    ? `${FOLDER}${INNER_DIR}/${fileName}`
    : FOLDER + fileName;

  console.log("PATH", PATH);

  if (!buffer && fileName.includes("pdf")) {
    await page.pdf({
      path: PATH,
      format: "A4",
      printBackground: true,
    });
  }
  console.log("CURRENT PAGE URL:", page.url());
  fs.writeFile(PATH, buffer, handleError);
  logImgInfo(PATH, fileName);
};

const downloadMaps = async (page, urls) => {
  if (!urls.length) return Promise.resolve();

  for await (const url of urls) {
    console.log("============");
    console.log("CURRENT URL:", url);
    const validUrl = url.includes("http") ? url : IMAGE_BASE_URL + url;
    if (
      (url.includes(".html") || !url.includes(BASE_URL_NAME_SPACE)) &&
      !FILE_FORMATS.some((restricted) => url.includes(restricted))
    ) {
      console.log("NESTING TO URL:", validUrl);
      console.log("IMAGE_BASE_URL", IMAGE_BASE_URL);
      const innerUrls = await getUrls(page, validUrl);
      await downloadMaps(page, innerUrls);
      continue;
    }
    try {
      const viewSource = await page.goto(validUrl);
      const imgTitle = await viewSource.frame().title();

      const buffer = await viewSource.buffer();

      createImg(url, imgTitle || url, page, buffer);
    } catch (e) {
      console.error(e);
      continue;
    }
  }
};

async function getUrls(page, pageUrl) {
  console.log("GET URLS FROM PAGE: ", pageUrl);

  await page.goto(pageUrl);
  const urls = await page.evaluate(
    (POSSIBLE_SELECTORS, urlNameSpace, BASE_URL, pageUrl) => {
      const links = [];

      POSSIBLE_SELECTORS.forEach((selector) => {
        const elements = document.querySelectorAll(selector);

        if (!elements.length) return;

        elements.forEach((item) => {
          let hrefString = item?.getAttribute("href");
          if (!hrefString) return;

          let validatedHref = hrefString.includes("http")
            ? hrefString
            : hrefString.replaceAll("/maps/", "");

          if (
            BASE_URL.includes(validatedHref) ||
            pageUrl.includes(validatedHref)
          )
            return;

          links.push(validatedHref);
        });
      });

      return links;
    },
    POSSIBLE_SELECTORS,
    BASE_URL_NAME_SPACE,
    BASE_URL,
    pageUrl
  );

  const filteredUrls = urls.filter(
    (item) => !IGNORE_URLS.some((ignoreUrl) => item.includes(ignoreUrl))
  );
  console.log("urls", filteredUrls);
  return filteredUrls;
}

const main = async () => {
  console.log("BASE_URL_NAME_SPACE", BASE_URL_NAME_SPACE);
  const browser = await puppeteer.launch(LAUNCH_OPTIONS);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  await page._client().send("Network.enable", {
    maxResourceBufferSize: 1024 * 1204 * 50,
    maxTotalBufferSize: 1024 * 1204 * 100,
  });

  const urls = await getUrls(page, BASE_URL);

  await downloadMaps(page, urls);

  await browser.close();
};

main();
