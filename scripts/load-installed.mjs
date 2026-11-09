const moduleUrl = 'file:///C:/Users/fqscf/.dsh/profiles/desktop/node_modules/dsh-coreutils-bash/executor.js'
try {
  const module = await import(moduleUrl)
  console.log(JSON.stringify({ name: module.name, inject: module.inject, hasConfig: module.Config !== undefined }, null, 2))
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
