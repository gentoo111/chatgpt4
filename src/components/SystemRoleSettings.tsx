import { Show,createSignal,onMount,onCleanup,For,createEffect } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import IconEnv from './icons/Env'
import type {PromptItem} from './Generator'
import { Fzf } from "fzf"

interface Props {
  canEdit: Accessor<boolean>
  systemRoleEditing: Accessor<boolean>
  setSystemRoleEditing: Setter<boolean>
  currentSystemRoleSettings: Accessor<string>
  setCurrentSystemRoleSettings: Setter<string>
  setPrompt:Setter< PromptItem[]>
  prompt:Accessor< PromptItem[]>
  hover: boolean
}

let systemInputRef: HTMLTextAreaElement
export default (props: Props) => {
  const originPrompts=props.prompt()
  const fzf = new Fzf(props.prompt(), {
    selector: k => `${k.desc} (${k.prompt})`
  })
  const [hoverIndex, setHoverIndex] = createSignal(0)
  const [showPrompt, setShowPrompt] = createSignal(false)
  const [maxHeight, setMaxHeight] = createSignal("320px")
  const [hasValue, setHasValue] = createSignal(false)
  function listener(e: KeyboardEvent) {
    if(props.systemRoleEditing()){
      if (e.key === "ArrowDown") {
        setHoverIndex(hoverIndex() + 1)
      } else if (e.key === "ArrowUp") {
        setHoverIndex(hoverIndex() - 1)
      } else if (e.key === "Enter") {
        systemInputRef.value=props.prompt()[hoverIndex()].prompt
        setShowPrompt(false)
        setHasValue(true)
      } else if(e.key===" "){
        setShowPrompt(true)
        e.preventDefault()
      }
    }

  }

  let containerRef: HTMLUListElement
  const handleButtonClick = () => {
    props.setCurrentSystemRoleSettings(systemInputRef.value)
    props.setSystemRoleEditing(false)
    setShowPrompt(false)
    props.setPrompt(originPrompts)
  }
  const showPreset=()=>{
    setShowPrompt(true)
    props.setPrompt(originPrompts)
  }
  const clearRole=()=>{
    systemInputRef.value=""
    setShowPrompt(false)
    setHasValue(false)
  }
  const itemClick=(k:string)=>{
    systemInputRef.value=k
    setShowPrompt(false)
    setHasValue(true)
  }
  createEffect(() => {
    if (hoverIndex() < 0) {
      setHoverIndex(0)
    } else if (hoverIndex() && hoverIndex() >= props.prompt().length) {
      setHoverIndex(props.prompt().length - 1)
    }
  })

  createEffect(() => {
    if (containerRef && props.prompt().length)
      setMaxHeight(
          `${
              window.innerHeight - containerRef.clientHeight > 112
                  ? 320
                  : window.innerHeight - 112
          }px`
      )
  })
  onMount(() => {
    window.addEventListener("keydown", listener)
  })
  onCleanup(() => {
    window.removeEventListener("keydown", listener)
  })
  return (
    <div class="my-4">
      <Show when={!props.systemRoleEditing()}>
        <Show when={props.currentSystemRoleSettings()}>
          <div>
            <div class="fi gap-1 op-50 dark:op-60">
              <IconEnv />
              <span>指定角色:</span>
            </div>
            <div class="mt-1">
              { props.currentSystemRoleSettings() }
            </div>
          </div>
        </Show>
        <Show when={!props.currentSystemRoleSettings() && props.canEdit()}>
          <span onClick={() => props.setSystemRoleEditing(!props.systemRoleEditing())} class="sys-edit-btn">
            <IconEnv />
            <span>指定系统角色</span>
          </span>
        </Show>
      </Show>
      <Show when={props.systemRoleEditing() && props.canEdit()}>
        <div>
          <div class="fi gap-1 op-50 dark:op-60">
            <IconEnv />
            <span>系统角色:</span>
          </div>
          <p class="my-2 leading-normal text-slate text-sm op-60">让GPT扮演你指定的角色</p>
          <div>
            <textarea
              ref={systemInputRef!}
              onInput={(e)=>{
                let { value } = e.currentTarget
                props.setPrompt(fzf.find(value).map(k => k.item))
                setHasValue(!!systemInputRef?.value)
              }}
              placeholder="可按空格键选择预设角色，也可以自己输入自定义角色。"
              autocomplete="off"
              autofocus
              rows="3"
              gen-textarea
            />
          </div>
          <Show when={showPrompt()}>
          <ul
              ref={containerRef!}
              class="bg-slate bg-op-15 dark:text-slate text-slate-7 overflow-y-auto rounded-t"
              style={{
                "max-height": maxHeight()
              }}
          >
            <For each={props.prompt()}>
              {(prompt, i) => (
                  <Item
                      prompt={prompt}
                      select={itemClick}
                      hover={hoverIndex() === i()}
                  />
              )}
            </For>
          </ul>
          </Show>
          <button onClick={handleButtonClick} text-green-700 mt-1 h-8 px-2 py-1 bg-slate bg-op-15 hover:bg-op-20 rounded-sm>
            设定角色
          </button>
          <Show when={!showPrompt()} >
            <button onClick={showPreset} mt-1 ml-2 h-8 px-2 py-1 bg-slate bg-op-15 hover:bg-op-20 rounded-sm>
              显示预设
            </button>
          </Show>
          <Show when={hasValue()} >
            <button onClick={clearRole} mt-1 ml-2 h-8 px-2 py-1 bg-slate bg-op-15 hover:bg-op-20 rounded-sm>
              清除角色
            </button>
          </Show>

        </div>
      </Show>
    </div>
  )
}

function Item(props: {
  prompt:  PromptItem
  hover: boolean
  select:(s:string)=>void
}) {
  let ref: HTMLLIElement
  createEffect(() => {
    if (props.hover) {
      ref.focus()
      ref.scrollIntoView({ block: "center" })
    }
  })
  return (
      <li
          ref={ref!}
          class="hover:bg-slate hover:bg-op-20 py-1 px-3"
          classList={{
            "bg-slate": props.hover,
            "bg-op-20": props.hover
          }}
          onClick={() => {
            props.select(props.prompt.prompt)
          }}
      >
        <p>{props.prompt.desc}</p>
        <p class="text-0.4em">{props.prompt.prompt}</p>
      </li>
  )
}