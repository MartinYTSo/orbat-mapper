// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";

import ScenarioLayerItemState from "@/modules/scenarioeditor/ScenarioLayerItemState.vue";
import { activeScenarioKey } from "@/components/injects";
import type { NTacticalGraphicLayerItem } from "@/types/scenarioLayerItems";

describe("ScenarioLayerItemState", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("manages a control measure's state with the shared layer-item operations", async () => {
    const setCurrentTime = vi.fn();
    const deleteLayerItemStateEntry = vi.fn();
    const clearLayerItemState = vi.fn();
    const item: NTacticalGraphicLayerItem = {
      id: "cm-1",
      _pid: "layer-1",
      kind: "tacticalGraphic",
      graphicKind: "phase-line",
      controlPoints: [[10, 60]],
      state: [{ id: "state-1", t: 100, patch: { controlPoints: [[11, 61]] } }],
    };

    const wrapper = mount(ScenarioLayerItemState, {
      props: { item, heading: "Control measure state" },
      global: {
        plugins: [createPinia()],
        provide: {
          [activeScenarioKey as symbol]: {
            store: { state: { currentTime: 100 } },
            time: { setCurrentTime },
            geo: { deleteLayerItemStateEntry, clearLayerItemState },
          },
        },
        stubs: {
          PanelSubHeading: { template: "<h2><slot /></h2>" },
          BaseButton: { template: "<button><slot /></button>" },
          IconButton: {
            props: ["title"],
            template:
              "<button :title='title' @click='$emit(\"click\")'><slot /></button>",
          },
          DotsMenu: defineComponent({
            emits: ["action"],
            template:
              "<button data-test='state-menu' @click='$emit(\"action\", \"delete\")'>Menu</button>",
          }),
        },
      },
    });

    expect(wrapper.text()).toContain("Control measure state");

    await wrapper.find("button[title='Goto Time and Place']").trigger("click");
    expect(setCurrentTime).toHaveBeenCalledWith(100);

    await wrapper.find("[data-test='state-menu']").trigger("click");
    expect(deleteLayerItemStateEntry).toHaveBeenCalledWith("cm-1", 0);

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Clear state")!
      .trigger("click");
    expect(clearLayerItemState).toHaveBeenCalledWith("cm-1");
  });

  it("shows a Restrictiveness slider for a polygon control measure", async () => {
    const updateTacticalGraphic = vi.fn();
    const item: NTacticalGraphicLayerItem = {
      id: "cm-polygon",
      _pid: "layer-1",
      kind: "tacticalGraphic",
      graphicKind: "polygon",
      controlPoints: [
        [10, 60],
        [11, 61],
        [10, 61],
      ],
      style: { opacity: 0.5 },
      state: [],
    };

    const SliderStub = defineComponent({
      name: "SliderStub",
      props: {
        modelValue: { type: Array, required: true },
      },
      emits: ["update:modelValue", "value-commit"],
      template:
        "<input data-test='restrictiveness-slider' type='range' :value='modelValue[0]' @input='$emit(\"update:modelValue\", [Number($event.target.value)])' @change='$emit(\"value-commit\")' />",
    });

    const wrapper = mount(ScenarioLayerItemState, {
      props: { item, heading: "Control measure state" },
      global: {
        plugins: [createPinia()],
        provide: {
          [activeScenarioKey as symbol]: {
            store: { state: { currentTime: 0 } },
            time: { setCurrentTime: vi.fn() },
            geo: {
              deleteLayerItemStateEntry: vi.fn(),
              clearLayerItemState: vi.fn(),
              updateTacticalGraphic,
            },
          },
        },
        stubs: {
          PanelSubHeading: { template: "<h2><slot /></h2>" },
          BaseButton: { template: "<button><slot /></button>" },
          IconButton: true,
          DotsMenu: true,
          Slider: SliderStub,
        },
      },
    });

    expect(wrapper.find("[data-test='restrictiveness-item']").text()).toContain(
      "Restrictiveness",
    );
    expect(wrapper.text()).toContain("50%");

    await wrapper.find("[data-test='restrictiveness-slider']").setValue("0.75");
    expect(updateTacticalGraphic).toHaveBeenCalledWith(
      "cm-polygon",
      { style: { opacity: 0.75 } },
      { undoable: false },
    );

    await wrapper.setProps({ item: { ...item, style: { opacity: 0.75 } } });
    await wrapper.find("[data-test='restrictiveness-slider']").trigger("change");
    expect(updateTacticalGraphic).toHaveBeenLastCalledWith(
      "cm-polygon",
      { style: { opacity: 0.75 } },
      { undoable: true },
    );
  });
});
