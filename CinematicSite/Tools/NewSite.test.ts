import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tool = join(import.meta.dir, "NewSite.ts");
function run(args: string[], cwd: string) {
  const env = { ...process.env };
  delete env.CINEMATIC_KIT;
  return Bun.spawnSync([process.execPath, tool, ...args, "--no-install", "--no-git"], {cwd,env,stdout:"pipe",stderr:"pipe"});
}

test("комплектный каркас работает из другого каталога и сохраняет кавычки и доллары бренда", async () => {
  const temp = mkdtempSync(join(tmpdir(), "cinematic-test-"));
  try {
    const result = run(["--name","demo-site","--brand",'Demo "Studio" $$',"--mark","<&","--locales","en,pt:pt-PT"],temp);
    expect(result.exitCode).toBe(0);
    const target = join(temp,"demo-site");
    const {site} = await import(join(target,"src/site.ts"));
    expect(site.brand.name).toBe('Demo "Studio" $$');
    expect(site.locales.map((l: {hreflang:string})=>l.hreflang)).toEqual(["en","pt-PT"]);
    expect(readFileSync(join(target,"public/favicon.svg"),"utf8")).toContain("&lt;&amp;");
    expect(existsSync(join(target,"node_modules"))).toBe(false);
    expect(existsSync(join(target,".git"))).toBe(false);
    expect(existsSync(join(target,"scripts/verify.ts"))).toBe(true);
    expect(readFileSync(join(target,"LICENSE"),"utf8")).toContain("MIT License");
    expect(readFileSync(join(target,".gitignore"),"utf8")).toContain(".env.*");
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

test("существующая папка и её содержимое не меняются", () => {
  const temp=mkdtempSync(join(tmpdir(),"cinematic-test-"));
  try {
    const target=join(temp,"demo"); mkdirSync(target); writeFileSync(join(target,"keep.txt"),"keep");
    expect(run(["--name","demo"],temp).exitCode).not.toBe(0);
    expect(readFileSync(join(target,"keep.txt"),"utf8")).toBe("keep");
    expect(existsSync(join(target,"package.json"))).toBe(false);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

test("пустой slug, неверный URL, язык и неизвестный флаг отвергаются до записи", () => {
  const temp=mkdtempSync(join(tmpdir(),"cinematic-test-"));
  try {
    for(const args of [["--name","!!!"],["--name","demo","--url","file:///tmp/a"],["--name","demo","--locales","en,pt;bad"],["--name","demo","--unknown"]]) {
      expect(run(args,temp).exitCode).not.toBe(0);
      expect(existsSync(join(temp,"demo"))).toBe(false);
    }
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
