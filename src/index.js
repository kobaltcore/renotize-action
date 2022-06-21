const fs = require("fs")
const path = require("path")
const core = require("@actions/core")
const exec = require("@actions/exec")
const glob = require("@actions/glob")
const cache = require("@actions/cache")
const github = require("@actions/github")
const tool_cache = require("@actions/tool-cache")
const http_client = require("@actions/http-client")

async function run() {
  const renkit_github_os_map = {
    "windows": "win32",
    "linux": "linux",
    "macos": "darwin",
  }
  const renkit_github_arch_map = {
    "amd64": "x64",
    "i386": "x86",
    "arm64": "arm64",
  }

  let runner_os = process.platform
  let runner_arch = process.arch

  const renkit_version = core.toPlatformPath(core.getInput("renkit-version"))
  const input_file = core.toPlatformPath(core.getInput("file"))

  console.log(`Input File: '${input_file}'`)

  // exit if file does not exist
  if (!fs.existsSync(input_file)) {
    const dir = core.toPlatformPath(path.resolve("./*"))
    const globber = await glob.create(dir)
    console.log(await globber.glob())
    throw new Error(`File to be notarized not found at '${input_file}'`)
  }

  const http = new http_client.HttpClient("renconstruct-action")
  const resp = await http.get("https://api.github.com/repos/kobaltcore/renkit/releases")

  if (resp.message.statusCode != 200) {
    throw new Error(`Unable to get list of renkit releases: ${resp.message.statusCode}`)
  }

  let renkit_releases = JSON.parse(await resp.readBody()).sort((a, b) => Date.parse(a.published_at) > Date.parse(b.published_at))
  let renkit_releases_dict = {}
  for (release of renkit_releases) {
    renkit_releases_dict[release.tag_name] = release
  }

  let renkit_target_release = renkit_releases_dict[renkit_version] || renkit_releases[0]

  console.log(`Using renkit ${renkit_target_release['tag_name']}`)

  // install renkit given renkit_version
  console.log("Installing renkit")
  for (bin of renkit_target_release["assets"]) {
    const [os, arch] = bin["name"].split(".")[0].split("-").slice(1)
    if (renkit_github_os_map[os] === runner_os && renkit_github_arch_map[arch] === runner_arch) {
      console.log(`OS: ${os} | Arch: ${renkit_github_arch_map[arch]}`)
      console.log(`Downloading renkit from ${bin["browser_download_url"]}`)
      const renkit_path = await tool_cache.downloadTool(bin["browser_download_url"])
      console.log("Extracting renkit")
      const renkit_extracted_dir = await tool_cache.extractZip(renkit_path, core.toPlatformPath(path.resolve("../renkit")))
      core.addPath(renkit_extracted_dir)
      break
    }
  }

  console.log(process.env)

  // run renotize
  await exec.exec("renotize", ["full_run", `-i=${core.toPlatformPath(input_file)}`])

  // generate output list of built distributions
  const distribution_dir = core.toPlatformPath(path.resolve(`${path.dirname(input_file)}/*`))
  const globber = await glob.create(distribution_dir)
  const distributions = await globber.glob()

  console.log(distributions)

  core.setOutput("distributions", distributions)
}

try {
  run()
} catch (error) {
  core.setFailed(error.message)
}
