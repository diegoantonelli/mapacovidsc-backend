# Backend - Mapa Covid SC #
- Para configurar será necessário criar o arquivo `.env` na pasta raiz do seu projeto.
Adicione as seguinte variaveis com suas informações de acesso ao MongoDB:
```
MONGO_URI=mongodb://user:password@localhost/database
DATABASE=database
NODE_ENV=development
```

## Banco de dados
- Você deverá criar a seguinte coleção em seu MongoDB:
`resumo`

## Documentação das APIs
- A documentação das APIs estão expostas usando Swagger UI, para chegar a documentação disponível, acesse:
`http://localhost:3000/api-docs`

## Comandos disponíveis
- Para iniciar o backend em modo desenvolvimento, basta executar `npm run dev` para executar o serviço utilizando todos os processadores e recursos disponíveis, utilize `npm start` para encerrar o processo iniciado utilize `npm run stop`.