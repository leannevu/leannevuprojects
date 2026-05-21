import base64
import io
import random
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scipy.optimize as spo


BASE_DIR = Path(__file__).resolve().parent.parent


class Optimize:
    def generateRandomStocks(self, num_to_generate=5):
        list_rand = []
        for i in range(num_to_generate):
            rand_num = random.randint(1, 1003)
            list_rand.append(rand_num)

        file_path = BASE_DIR / "static" / "optimization" / "stock_names.csv"
        stock_names = pd.read_csv(file_path, header=None)
        df_to_series = stock_names.iloc[list_rand, 0]
        return df_to_series

    def get_dates(self):
        start_date = "2009-12-31"
        end_date = "2010-12-07"

        idx = pd.date_range(start_date, end_date)
        return idx

    def symbol_to_path(self, symbol, dir="data"):
        return BASE_DIR / "static" / "optimization" / dir / f"{symbol}"

    def getRandomPortfolio(self, symbols, dates):
        random_portfolio = self.getSPYPortfolio("SPY.csv", dates)

        for s in symbols:
            file_path = self.symbol_to_path(s)
            df_temp = pd.read_csv(
                file_path,
                parse_dates=True,
                index_col="Date",
                usecols=["Date", "Adj Close"],
                na_values=["nan"],
            )
            df_temp = df_temp.rename(columns={"Adj Close": s})
            random_portfolio = random_portfolio.join(df_temp)

        random_portfolio.dropna(inplace=True)
        random_portfolio.drop("SPY.csv", axis=1, inplace=True)
        return random_portfolio

    def getSPYPortfolio(self, symbol, dates):
        portfolio = pd.DataFrame(index=dates)

        file_path = self.symbol_to_path(symbol)
        df_temp = pd.read_csv(
            file_path,
            parse_dates=True,
            index_col="Date",
            usecols=["Date", "Adj Close"],
            na_values=["nan"],
        )
        df_temp = df_temp.rename(columns={"Adj Close": symbol})
        portfolio = portfolio.join(df_temp)

        portfolio.dropna(inplace=True)
        return portfolio

    def optimize_portfolio(self):
        symbols = self.generateRandomStocks()
        dates = self.get_dates()
        random_porfolio = self.getRandomPortfolio(symbols, dates)

        while len(random_porfolio) < 50:
            random_porfolio = self.getRandomPortfolio(symbols, dates)

        SPY_portfolio = self.getSPYPortfolio("SPY.csv", dates)

        num_allocs = len(random_porfolio.columns)
        allocGuess = np.ones(num_allocs)
        allocGuess = allocGuess * (1 / num_allocs)

        bounds = [(0.0, 1.0)] * num_allocs
        result = spo.minimize(
            fun=lambda x, d: self.maximize_sharp_ratio(x, d),
            x0=allocGuess,
            args=(random_porfolio,),
            method="SLSQP",
            options={"disp": False},
            bounds=bounds,
            constraints=({"type": "eq", "fun": lambda x: 1 - np.sum(x)}),
        )

        optimal_allocs = result.x
        cr, adr, sddr, sr = self.compute_returns(random_porfolio, optimal_allocs)

        port_val = self.normalize_portfolio(random_porfolio, optimal_allocs)
        SPY_val = self.normalize_prices(SPY_portfolio)

        df_dateranges = pd.DataFrame(index=pd.date_range("2009-12-31", "2010-12-31"))
        port_val_all_dates = df_dateranges.join(port_val)
        SPY_val_all_dates = df_dateranges.join(SPY_val)

        port_val_all_dates.ffill(inplace=True)
        port_val_all_dates.bfill(inplace=True)
        SPY_val_all_dates.ffill(inplace=True)
        SPY_val_all_dates.bfill(inplace=True)

        plt.plot(port_val_all_dates, label="Portfolio")
        plt.plot(SPY_val_all_dates, label="SPY")
        plt.legend()
        plt.margins(x=0)
        plt.xlabel("Date")
        plt.ylabel("Price")
        plt.title("Optimized Daily Porfolio Value and SPY")

        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        plt.close()
        buf.seek(0)
        encoded = base64.b64encode(buf.read()).decode("utf-8")
        buf.close()

        symbols = symbols.str.replace(".csv", "", regex=False).tolist()
        return {
            "encoded_image": f"data:image/png;base64,{encoded}",
            "allocs": np.round(optimal_allocs, 6).tolist(),
            "computations": [
                cr,
                adr,
                sddr,
                round(sr, 6),
            ],
            "symbols": symbols,
        }

    def compute_returns(self, df, allocs):
        start_val = 1000000

        prices = df.astype("float64")
        allocations = np.asarray(allocs).ravel()

        normed = prices / prices.iloc[0]
        alloced = normed * allocations
        pos_vals = alloced * start_val
        port_val = pos_vals.sum(axis=1)

        daily_rets = (port_val[1:] / port_val[:-1].values) - 1

        cum_ret = (port_val.iloc[-1] / port_val.iloc[0]) - 1
        avg_daily_ret = daily_rets.mean(axis=0)
        std_daily_ret = daily_rets.std(axis=0)

        k = 252
        SR = np.sqrt(k) * (avg_daily_ret / std_daily_ret)
        return round(cum_ret, 6), round(avg_daily_ret, 6), round(std_daily_ret, 6), round(SR, 6)

    def maximize_sharp_ratio(self, allocs, data):
        start_val = 1000000

        prices = data.astype("float64")
        allocations = np.asarray(allocs).ravel()

        normed = prices / prices.iloc[0]
        alloced = normed * allocations
        pos_vals = alloced * start_val
        port_val = pos_vals.sum(axis=1)

        daily_rets = (port_val[1:] / port_val[:-1].values) - 1

        avg_daily_ret = daily_rets.mean(axis=0)
        std_daily_ret = daily_rets.std(axis=0)

        k = 252
        SR = np.sqrt(k) * (avg_daily_ret / std_daily_ret) * -1
        return SR

    def normalize_prices(self, df):
        start_val = 1
        prices = df.astype("float64")
        normed = prices / prices.iloc[0]
        normed = normed * start_val

        return normed

    def normalize_portfolio(self, df, allocs):
        start_val = 1
        prices = df.astype("float64")
        allocations = np.asarray(allocs).ravel()

        normed = prices / prices.iloc[0]
        alloced = normed * allocations
        pos_vals = alloced * start_val
        port_val = pos_vals.sum(axis=1)

        result = port_val
        result = result.rename("Normalized Portfolio")
        return result
