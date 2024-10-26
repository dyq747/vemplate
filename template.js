const vue2 = (params = "scss") =>
  `<template>
  <div>

  </div>
</template>

<script>
export default {

}
</script>

<style lang="${params}" scoped>

</style>
`;

const vue3 = (params = "scss") =>
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

<style lang="${params}" scoped>

</style>
`;

const vue3Setup = () =>
  `<template>
  <div>

  </div>
</template>

<script setup>

</script>

<style lang="scss" scoped>

</style>
`;

const vue3Reactive = () =>
  `<template>
  <div>

  </div>
</template>

<script>
import { reactive, toRefs } from 'vue'

export default {
  setup () {
    const state = reactive({
      name: 'Someone',
    })
  
    return {
      ...toRefs(state),
    }
  }
}
</script>

<style lang="scss" scoped>

</style>
`;

const vue3Ts = (params = "scss") =>
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

<style lang="${params}" scoped>

</style>
`;

const vue3TsSetup = () =>
  `<template>
  <div>

  </div>
</template>

<script setup lang="ts">

</script>

<style lang="scss" scoped>

</style>
`;

// 可选的模板列表
const templates = {
  vue2: vue2(),
  vue3: vue3(),
  "vue3-ts": vue3Ts(),
  "vue3-ts-setup": vue3TsSetup(),
  "vue3-setup": vue3Setup(),
  "vue3-reactive": vue3Reactive(),
  "vue2-less": vue2("less"),
  "vue3-less": vue3("less"),
  "vue2-stylus": vue2("stylus"),
  "vue3-stylus": vue3("stylus"),
};

module.exports = templates;
