import http.server
import urllib.request
import urllib.parse
import json

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)
        
        # Se a rota for /proxy e tiver a URL alvo
        if '/proxy' in parsed_path.path and 'url' in query_params:
            target_url = query_params['url'][0]
            
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            try:
                # User-Agent para simular navegador e timeout de 45 segundos
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=45) as response:
                    data = response.read()
                    self.wfile.write(data)
            except Exception as e:
                print(f"Erro ao buscar: {target_url} -> {e}")
                error_msg = json.dumps({"error": str(e)}).encode('utf-8')
                self.wfile.write(error_msg)
        else:
            self.send_response(404)
            self.end_headers()

# Inicia o servidor na porta 8080
PORT = 8080
with http.server.HTTPServer(("", PORT), ProxyHandler) as httpd:
    print(f"🚀 Servidor Proxy rodando em http://localhost:{PORT}")
    print("Deixe esta janela aberta enquanto usa o painel.")
    httpd.serve_forever()