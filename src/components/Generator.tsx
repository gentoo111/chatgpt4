import type { ChatMessage } from '@/types'
import { createSignal, Index, Show, onMount, onCleanup } from 'solid-js'
import IconClear from './icons/Clear'
import IconRobotDead from './icons/RobotDead'
import IconSend from './icons/Send'
import MessageItem from './MessageItem'
import SystemRoleSettings from './SystemRoleSettings'
import {generateSignature} from '@/utils/auth'
import KeySetting from "./KeySetting";
import { useThrottleFn } from 'solidjs-use'
// @ts-ignore
import { createResizeObserver } from "@solid-primitives/resize-observer"
import {isMobile} from "@/utils/auth";

export interface PromptItem {
    desc: string
    prompt: string
}
interface Props{
    prompts:PromptItem[]
}
export default (props:Props) => {
    let inputRef: HTMLTextAreaElement, keyRef: HTMLInputElement
    const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = createSignal('')
    const [currentKey, setCurrentKey] = createSignal('')
    const [systemRoleEditing, setSystemRoleEditing] = createSignal(false)
    const [showKey, setKey] = createSignal(false)
    const [messageList, setMessageList] = createSignal<ChatMessage[]>([])
    const [currentAssistantMessage, setCurrentAssistantMessage] = createSignal('')
    const [loading, setLoading] = createSignal(false)
    const [controller, setController] = createSignal<AbortController>(null)
    const [containerWidth, setContainerWidth] = createSignal("init")
    let forcedAssistant: HTMLTextAreaElement
    let containerRef: HTMLDivElement
    const [forcedAssistantEnabled, setForcedAssistantEnabled] = createSignal(false)
    const [prompt, setPrompt] = createSignal<PromptItem[]>([])
    setPrompt(props.prompts)

    onMount(() => {
        createResizeObserver(containerRef, ({ width, height }, el) => {
            if (el === containerRef) setContainerWidth(`${width}px`)
        })
        setCurrentKey(localStorage.getItem("key") ?? "")
        try {
            if (localStorage.getItem('messageList')) {
                setMessageList(JSON.parse(localStorage.getItem('messageList')))
                smoothToBottom()
            }
            if (localStorage.getItem('systemRoleSettings')) {
                setCurrentSystemRoleSettings(localStorage.getItem('systemRoleSettings'))
            }
        } catch (err) {
            console.error(err)
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        onCleanup(() => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
        })
    })
    const handleBeforeUnload = () => {
        localStorage.setItem('messageList', JSON.stringify(messageList()))
        localStorage.setItem('systemRoleSettings', currentSystemRoleSettings())
    }

    const handleButtonClick = async () => {
    const inputValue = inputRef.value
    if (!inputValue) {
      return
    }

        localStorage.setItem("key", currentKey())
        if (forcedAssistantEnabled()) {
            forceAssistant(inputValue)
            return
        }
    // @ts-ignore
    if (window?.umami) umami.trackEvent('chat_generate')
    inputRef.value = ''
    setMessageList([
      ...messageList(),
      {
        role: 'user',
        content: inputValue,
      },
    ])
    requestWithLatestMessage()
        smoothToBottom()
  }

    const forceAssistant = (message: string) => {
        const forcedValue = forcedAssistant.value
        if (!forcedValue) {
            return
        }

        forcedAssistant.value = ''
        inputRef.value = ''

        setMessageList([
            ...messageList(),
            {
                role: 'user',
                content: message,
            },
            {
                role: 'assistant',
                content: forcedValue,
            }
        ])

        !isMobile()&&inputRef.focus()
    }

    const smoothToBottom = useThrottleFn(() => {

        setTimeout(()=>{
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
        },300)

    }, 300, false, true)

    const requestWithLatestMessage = async () => {
        setLoading(true)
        setCurrentAssistantMessage('')
        const storagePassword = localStorage.getItem('pass')
        const msgLimit=import.meta.env.PUBLIC_MSG_LIMIT??3
        try {
            const controller = new AbortController()
            setController(controller)
            const originRequestMessageList = [...messageList()]
            let requestMessageList=originRequestMessageList.slice(-msgLimit)
            if (currentSystemRoleSettings()) {
                requestMessageList.unshift({
                    role: 'system',
                    content: currentSystemRoleSettings(),
                })
            }

            const timestamp = Date.now()
            const response = await fetch('/api/generate', {
                method: 'POST',
                body: JSON.stringify({
                    key: currentKey(),
                    messages: requestMessageList,
                    pass: storagePassword,
                    time: timestamp,
                    sign: await generateSignature({
                        t: timestamp,
                        m: requestMessageList?.[requestMessageList.length - 1]?.content || '',
                    }),
                }),
                signal: controller.signal,
            })
            if (!response.ok) {
                throw new Error(response.statusText)
            }
            const data = response.body
            if (!data) {
                throw new Error('No data')
            }
            const reader = data.getReader()
            const decoder = new TextDecoder('utf-8')
            let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        if (value) {
          let char = decoder.decode(value)
          if (char === '\n' && currentAssistantMessage().endsWith('\n')) {
            continue
          }
          if (char) {
            setCurrentAssistantMessage(currentAssistantMessage() + char)
          }
          smoothToBottom()
        }
        done = readerDone
          smoothToBottom()
      }
    } catch (e) {
      console.error(e)
      setLoading(false)
      setController(null)
      return
    }
    archiveCurrentMessage()
  }

    const archiveCurrentMessage = () => {
        if (currentAssistantMessage()) {
            setMessageList([
                ...messageList(),
                {
                    role: 'assistant',
                    content: currentAssistantMessage(),
                },
            ])
            setCurrentAssistantMessage('')
            setLoading(false)
            setController(null)
            !isMobile()&&inputRef.focus()
        }
    }

    const clear = () => {
        inputRef.value = ''
        inputRef.style.height = 'auto';
        setMessageList([])
        setCurrentAssistantMessage('')
        setCurrentSystemRoleSettings('')
    }

    const stopStreamFetch = () => {
        if (controller()) {
            controller().abort()
            archiveCurrentMessage()
        }
    }

    const retryLastFetch = () => {
        if (messageList().length > 0) {
            const lastMessage = messageList()[messageList().length - 1]
            console.log(lastMessage)
            if (lastMessage.role === 'assistant') {
                setMessageList(messageList().slice(0, -1))
                requestWithLatestMessage()
            }
        }
    }

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.isComposing || e.shiftKey) {
            return
        }
        if (e.key === 'Enter') {
            handleButtonClick()
        }
    }
    return (
    <div my-6 mb-20 sm:mb-32 ref={containerRef!}>
      <SystemRoleSettings
        canEdit={() => messageList().length === 0}
        systemRoleEditing={systemRoleEditing}
        setSystemRoleEditing={setSystemRoleEditing}
        currentSystemRoleSettings={currentSystemRoleSettings}
        setCurrentSystemRoleSettings={setCurrentSystemRoleSettings}
        prompt={prompt}
        setPrompt={setPrompt}
        hover={false}

      />
        <KeySetting
            setKey={setKey}
            showKey={showKey}
            currentKey={currentKey}
            setCurrentKey={setCurrentKey}
        />
      <Index each={messageList()}>
        {(message, index) => (
          <MessageItem
            role={message().role}
            message={message().content}
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
          />
        )}
      </Index>
      {currentAssistantMessage() && (
        <MessageItem
          role="assistant"
          message={currentAssistantMessage}
        />
      )}
        <div
            class="pb-10 sm:pb-20 fixed bottom-0 z-100 op-0"
            style={
                containerWidth() === "init"
                    ?{}
                    : {
                        width: containerWidth(),
                        opacity: 100,
                        "background-color": "var(--c-bg)"
                    }
            }
        >
      <Show
        when={!loading()}
        fallback={() => (

            <div class="gen-cb-wrapper">
                <span>ChatGPT正在思考...</span>
                <div class="gen-cb-stop" onClick={stopStreamFetch}>停止</div>
            </div>
        )}
      >

          <div class="gen-text-wrapper" class:op-50={systemRoleEditing()}>
          <textarea
            ref={inputRef!}
            disabled={systemRoleEditing()}
            onKeyDown={handleKeydown}
            placeholder="SHIFT+ENTER换行"
            autocomplete="off"
            autofocus
            onInput={() => {
              inputRef.style.height = 'auto';
              inputRef.style.height = inputRef.scrollHeight + 'px';
            }}
            rows="1"
            class='gen-textarea'
          />
          <button title="发送" onClick={handleButtonClick} disabled={systemRoleEditing()}  h-12 px-4 py-2 bg-slate bg-op-15 hover:bg-op-20 rounded-sm>
            <IconSend />
          </button>
          <button title="清除" onClick={clear} disabled={systemRoleEditing()}  h-12 px-4 py-2 bg-slate bg-op-15 hover:bg-op-20 rounded-sm>
            <IconClear />
          </button>
          <button title="Forced Assistant" onClick={() => setForcedAssistantEnabled((prev) => !prev)}
                  disabled={systemRoleEditing()} hidden sm:block h-12 px-4 py-2 bg-slate bg-op-15
                  hover:bg-op-20  rounded-sm>
              <IconRobotDead/>
          </button>
        </div>
          <Show when={forcedAssistantEnabled()}>
          <textarea
              ref={forcedAssistant!}
              disabled={systemRoleEditing()}
              onKeyDown={handleKeydown}
              placeholder="Enter forced assistant text..."
              autocomplete="off"
              autofocus
              onInput={() => {
                  forcedAssistant.style.height = 'auto';
                  forcedAssistant.style.height = forcedAssistant.scrollHeight + 'px';
              }}
              rows="1"
              class='gen-textarea'
          />

          </Show>

      </Show>
        </div>
    </div>

  )
}
