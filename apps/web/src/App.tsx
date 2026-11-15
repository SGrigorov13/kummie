import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
  Account,
  ArticlePage,
  AskPage,
  CalendarPage,
  CartPage,
  Club,
  CollectPage,
  GroupsPage,
  Home,
  Legal,
  Magazine,
  OrderPage,
  ProductPage,
  Shop,
  Teen,
} from "./screens.tsx";
import { Shell } from "./shell.tsx";
import { StoreProvider } from "./store.tsx";

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="shop" element={<Shop />} />
            <Route path="shop/:id" element={<ProductPage />} />
            <Route path="collect" element={<CollectPage />} />
            <Route path="magazine" element={<Magazine />} />
            <Route path="magazine/:slug" element={<ArticlePage />} />
            <Route path="teen" element={<Teen />} />
            <Route path="teen/:slug" element={<ArticlePage />} />
            <Route path="club" element={<Club />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="account" element={<Account />} />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="ask" element={<AskPage />} />
            <Route path="legal/:page" element={<Legal />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
