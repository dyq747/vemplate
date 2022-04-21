const vue2 = params =>
`<template>
  <div>

  </div>
</template>

<script>
export default {

}
</script>

<style ${ params ? `lang="${params}" ` : '' }scoped>

</style>
`

const vue3 = params =>
`<template>
  <div>

  </div>
</template>

<script>
export default {
  setup () {


    return {}
  }
}
</script>

<style ${ params ? `lang="${params}" ` : '' }scoped>

</style>
`

const vue3Ts = params =>
`<template>
  <div>

  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  setup () {


    return {}
  }
})
</script>

<style ${ params ? `lang="${params}" ` : '' }scoped>

</style>
`

// 可选的模板列表
const templates = {
  vue2: vue2(),
  'vue2-sass': vue2('scss'),
  'vue2-less': vue2('less'),
  vue3: vue3(),
  'vue3-sass': vue3('scss'),
  'vue3-less': vue3('less'),
  'vue3-ts': vue3Ts(),
  'vue3-ts-sass': vue3Ts('scss'),
  'vue3-ts-less': vue3Ts('less')
}

module.exports = templates