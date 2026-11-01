"""Única ferramenta executável. Nenhuma chamada a shell."""
from urllib.parse import urlsplit
import webbrowser
import ipaddress
import re


def validate_url(value):
    if not isinstance(value, str) or len(value) > 2048 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value) or '\\' in value:
        raise ValueError('URL inválida')
    try:
        parsed = urlsplit(value)
        port = parsed.port
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None or parsed.password is not None:
            raise ValueError('Use uma URL http/https sem credenciais')
        host = parsed.hostname.encode('idna').decode('ascii')
        if ':' in host:
            ipaddress.IPv6Address(host)
        elif len(host) > 253 or any(not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label) for label in host.rstrip('.').split('.')):
            raise ValueError('Host inválido')
    except (ValueError, UnicodeError) as error:
        raise ValueError('Use uma URL http/https válida, sem credenciais') from error
    return value


def open_url(url, *, confirmed=False, opener=None):
    url = validate_url(url)
    if confirmed is not True:
        raise PermissionError('Abertura exige confirmação explícita')
    return (opener or webbrowser.open)(url, new=2)
