#!/usr/bin/env python3
from pathlib import Path


MIDDLEWARE = Path('/app/backend/open_webui/utils/middleware.py')
INDEX_HTML = Path('/app/build/index.html')
CONTENT_MARKER = 'KERN_CONTENT_FROM_OUTPUT_FIX'
DEFAULT_MODEL_MARKER = 'KERN_DEFAULT_MODEL_BOOTSTRAP'
CHAT_DEFAULT_MODEL_MARKER = 'KERN_CHAT_DEFAULT_MODEL_PATCH'


def patch_content_from_output() -> None:
    text = MIDDLEWARE.read_text(encoding='utf-8')
    if CONTENT_MARKER in text:
        return
    if (
        'def extract_text_from_response_output(response_output):' in text
        and "'content': content," in text
        and 'content = extract_text_from_response_output(response_output)' in text
    ):
        return

    anchor = '''    response, response_data = get_response_data(response)
    if response_data is None:
        return response

'''
    helper = f'''    # {CONTENT_MARKER}: OpenWebUI can persist provider `output` without message `content`.
    # Kern/OpenAI-compatible responses must still render in the chat bubble.
    def extract_text_from_response_output(response_output):
        if not isinstance(response_output, list):
            return ''

        text_parts = []
        for item in response_output:
            if not isinstance(item, dict) or item.get('type') != 'message':
                continue

            for part in item.get('content', []) or []:
                if isinstance(part, dict) and part.get('type') == 'output_text':
                    text = part.get('text')
                    if text:
                        text_parts.append(str(text))

        return ''.join(text_parts)

'''
    if anchor not in text:
        raise SystemExit('middleware.py patch anchor not found')
    text = text.replace(anchor, anchor + helper, 1)

    old_content = '''            content = choices[0].get('message', {}).get('content') if choices else ''

            if choices and (content or response_output):
'''
    new_content = '''            content = choices[0].get('message', {}).get('content') if choices else ''
            if not content and response_output:
                content = extract_text_from_response_output(response_output)

            if choices and (content or response_output):
'''
    if old_content not in text:
        raise SystemExit('middleware.py content extraction anchor not found')
    text = text.replace(old_content, new_content, 1)

    old_save = '''                            {
                                'done': True,
                                'role': 'assistant',
                                'output': response_output,
                                **({'usage': usage} if usage else {}),
                            },
'''
    new_save = '''                            {
                                'done': True,
                                'role': 'assistant',
                                'content': content,
                                'output': response_output,
                                **({'usage': usage} if usage else {}),
                            },
'''
    if old_save not in text:
        raise SystemExit('middleware.py save anchor not found')
    MIDDLEWARE.write_text(text.replace(old_save, new_save, 1), encoding='utf-8')


def patch_default_model_bootstrap() -> None:
    text = INDEX_HTML.read_text(encoding='utf-8')
    if DEFAULT_MODEL_MARKER in text and "url.searchParams.set('models', defaultModel)" in text:
        return
    if DEFAULT_MODEL_MARKER in text:
        old = '''					sessionStorage.setItem('selectedModels', selected);

					const settings = JSON.parse(localStorage.getItem('settings') || '{}');
'''
        new = '''					sessionStorage.setItem('selectedModels', selected);
					const url = new URL(window.location.href);
					if (url.pathname === '/' && !url.searchParams.has('model') && !url.searchParams.has('models')) {
						url.searchParams.set('models', defaultModel);
						window.history.replaceState(window.history.state, '', url.toString());
					}

					const settings = JSON.parse(localStorage.getItem('settings') || '{}');
'''
        if old not in text:
            raise SystemExit('index.html existing default model bootstrap anchor not found')
        INDEX_HTML.write_text(text.replace(old, new, 1), encoding='utf-8')
        return

    anchor = '''		<script>
			function resizeIframe(obj) {
				obj.style.height = obj.contentWindow.document.documentElement.scrollHeight + 'px';
			}
		</script>

'''
    script = f'''		<script>
			// {DEFAULT_MODEL_MARKER}: this client install exposes one model; always select it.
			(() => {{
				try {{
					const defaultModel = 'kern-numa';
					const selected = JSON.stringify([defaultModel]);
					sessionStorage.setItem('selectedModels', selected);
					const url = new URL(window.location.href);
					if (url.pathname === '/' && !url.searchParams.has('model') && !url.searchParams.has('models')) {{
						url.searchParams.set('models', defaultModel);
						window.history.replaceState(window.history.state, '', url.toString());
					}}

					const settings = JSON.parse(localStorage.getItem('settings') || '{{}}');
					const models = Array.isArray(settings.models) ? settings.models : [];
					const pinnedModels = Array.isArray(settings.pinnedModels) ? settings.pinnedModels : [];
					settings.models = models.includes(defaultModel) ? models : [defaultModel, ...models];
					settings.pinnedModels = pinnedModels.includes(defaultModel)
						? pinnedModels
						: [defaultModel, ...pinnedModels];
					localStorage.setItem('settings', JSON.stringify(settings));
				}} catch (error) {{
					console.warn('Kern default model bootstrap skipped', error);
				}}
			}})();
		</script>

'''
    if anchor not in text:
        raise SystemExit('index.html default model bootstrap anchor not found')
    INDEX_HTML.write_text(text.replace(anchor, anchor + script, 1), encoding='utf-8')


def patch_chat_default_model() -> None:
    for path in Path('/app/build/_app/immutable').rglob('*.js'):
        text = path.read_text(encoding='utf-8')
        if CHAT_DEFAULT_MODEL_MARKER in text:
            return
        if 'default_models' not in text or 'sessionStorage.selectedModels' not in text:
            continue
        anchor = 'h(ee,r(ee).filter(ot=>re.includes(ot)));'
        if anchor not in text:
            continue
        replacement = (
            anchor
            + f'/* {CHAT_DEFAULT_MODEL_MARKER} */'
            + 're.includes("kern-numa")&&h(ee,["kern-numa"]);'
        )
        path.write_text(text.replace(anchor, replacement, 1), encoding='utf-8')
        return

    raise SystemExit('chat default model patch anchor not found')


def main() -> None:
    patch_content_from_output()
    patch_default_model_bootstrap()
    patch_chat_default_model()


if __name__ == '__main__':
    main()
