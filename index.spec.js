const puppeteer = require("puppeteer");
const path = require("path");
const settings = require("./settings.json");
const loginUrl = `${settings.memriseBaseUrl}/login/`;
const courseName = settings.courseName;

/**
 * @type  {puppeteer.Page}
 */
let page;
/**
 * @type  {puppeteer.Browser}
 */
let browser;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: settings.headless
    // devtools: false,
    // args: ["--start-maximized"]
  });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

describe("Open memrise.com", () => {
  it("Navigate to login page", async () => {
    await page.goto(loginUrl);
    expect(await page.title()).toBe("Memrise - Log in");
  });

  it("Should fill username/password", async () => {
    await page
      .focus("[name=username]")
      .then(_ => page.keyboard.type(settings.username));

    await page
      .focus("[name=password]")
      .then(_ => page.keyboard.type(settings.password));

    await page
      .$("[name=username]")
      .then(async e => await e.getProperty("value"))
      .then(async e => await e.jsonValue())
      .then(username => expect(username).toBe(settings.username));

    await page
      .$("[name=password]")
      .then(async e => await e.getProperty("value"))
      .then(async e => await e.jsonValue())
      .then(password => expect(password).toBe(settings.password));
  });

  it("Should log-in to Memrise", async () => {
    await page
      .focus("[data-testid=loginFormSubmit]")
      .then(_ => page.keyboard.press("Enter"));

    await page.waitForSelector(".profile-header");

    if ((await page.$("button[data-dismiss=modal]")) !== null) {
      await page
        .focus("button[data-dismiss=modal]")
        .then(_ => page.keyboard.press("Enter"));
    }

    expect(await page.title()).toBe("Dashboard - Memrise");
  });

  it("Should find the course", async () => {
    await page.waitForSelector(".card-main-container");

    let courses = Array.from(await page.$$("a[href^='/course/']"));
    let course = courses.find(
      async c =>
        (await (await c.getProperty("innerText")).jsonValue()) === courseName
    );

    let editUrl =
      (await (await course.getProperty("href")).jsonValue()) + "edit/";

    await page.goto(editUrl);

    expect(await page.title()).toContain("Editing");
  });

  let words = require(`./courses/${courseName}.json`);

  it("Should insert all words", async () => {
    await page.waitForSelector(".editing-controls .dropdown-toggle");

    let advanced = await page.$(".editing-controls .dropdown-toggle");
    await page.focus(".editing-controls .dropdown-toggle");
    await advanced.click();
    await page.waitFor(100);

    let addBulkButton = await page.$("[data-role=level-bulk-add]");
    await page.focus("[data-role=level-bulk-add]");
    await addBulkButton.click();
    await page.waitFor(500);

    let data = words
      .map(w => {
        let type = w.type;
        let column1 = w[settings.columnMaps.column1].trim();
        let column2 = w[settings.columnMaps.column2];
        column2 =
          typeof column2 === "undefiend" ||
          column2 === null ||
          column2.trim() === ""
            ? column1
            : column2.trim();
        if (typeof type === "undefined" || type === null)
          return `${column1}\t${column2}`;
        return `${column1}\t${column2}\t \ttype`;
      })
      .join("\n\n");

    await page.waitForSelector(".modal-bulk-add");
    await page.focus(".modal-bulk-add textarea");
    await page.waitFor(100);
    await page.evaluate(data => {
      document.querySelector(".modal-bulk-add textarea").value = data;
    }, data);

    await page.focus(".modal-bulk-add .btn-primary");
    await page.keyboard.press("Enter");
    await page.waitForNavigation();
    await page.waitForSelector("tbody tr");
    expect((await page.$$("tbody tr")).length - 3).toBe(words.length);
  });

  it(
    "Should upload all audio files",
    async () => {
      let audioCount = 0;
      await page.waitForSelector("input.add_thing_file");
      let inputs = Array.from(await page.$$("input[type=file].add_thing_file"));
      for (let i = 0; i < words.length; i++) {
        let word = words[i];
        if (typeof word.audio !== "undefined" && word.audio != null) {
          let audioFile = word.audio.split("/");
          audioFile = audioFile[audioFile.length - 1];
          let fileToUpload = path.resolve(
            `./courses/${courseName}/${audioFile}`
          );

          await inputs[i].uploadFile(fileToUpload);
          await page.evaluate(
            element => $(element).trigger("change"),
            inputs[i]
          );
          await page.waitForResponse(
            "https://www.memrise.com/ajax/thing/cell/upload_file/"
          );
          audioCount++;
        }
      }

      await page.screenshot({
        path: `${courseName}-result.png`,
        fullPage: true
      });

      let totalWordsInPage = (await page.$$("tbody tr")).length - 3;
      let fileUploadInPage = (await page.$$("input[type=file].add_thing_file"))
        .length;
      expect(totalWordsInPage - fileUploadInPage).toBe(audioCount);

      await page.focus(".btn-success");
      await page.keyboard.press("Enter");
      await page.waitForNavigation();

      expect(await page.title()).toBe(`${courseName} - Memrise`);
    },
    words.length * 10000
  );
});
