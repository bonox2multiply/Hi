import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', fullyParallel:true, forbidOnly:!!process.env.CI,
  retries:0, workers:2, timeout:30000,
  reporter: [['list'], ['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4177',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure',
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}},
  projects:[{name:'desktop',use:{browserName:'chromium',viewport:{width:1280,height:900}}},
    {name:'mobile',use:{browserName:'chromium',viewport:{width:390,height:844}}}],
  webServer:{command:'node tests/browser/server.mjs',url:'http://127.0.0.1:4177',reuseExistingServer:false,timeout:15000},
});
